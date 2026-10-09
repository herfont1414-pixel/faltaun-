import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { upsertDeliveryZone, listDeliveryZones } from "@/lib/admin/store";
import { setLocalLocation, getLocalLocation, quoteDelivery } from "@/lib/admin/delivery-quote";
import { createWebOrder } from "@/lib/admin/web-orders";
import { haversineKm, isValidLatLng } from "@/lib/geo";
import { searchAddress, reverseAddress, clearGeocodeCache } from "@/lib/geocode";

let dbPath: string;
let productName: string;

// Un punto cualquiera como "el local" y puntos a distancia conocida hacia el norte
// (1 grado de latitud ≈ 111,19 km).
const LOCAL = { lat: -27.4, lng: -55.9 };
const north = (km: number) => ({ lat: LOCAL.lat + km / 111.19, lng: LOCAL.lng });

beforeAll(async () => {
  dbPath = await seedFreshDb("delivery-distance");
  productName = (await anyInStockProduct()).name;
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearGeocodeCache();
});

function order(point: { lat: number; lng: number } | null, zone: string | null = null) {
  return createWebOrder({
    customerName: "Cliente",
    customerPhone: "5493751000000",
    notes: null,
    items: [{ name: productName, qty: 1 }],
    fulfillment: "delivery",
    customerAddress: "Calle 1",
    deliveryZone: zone,
    deliveryLat: point?.lat ?? null,
    deliveryLng: point?.lng ?? null,
  });
}

describe("geo", () => {
  it("haversine: 1 grado de latitud son unos 111 km y la distancia es simétrica", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
    const a = { lat: -27.37, lng: -55.9 };
    const b = { lat: -27.5, lng: -55.7 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
    expect(haversineKm(a, a)).toBe(0);
  });

  it("valida coordenadas", () => {
    expect(isValidLatLng(-27.4, -55.9)).toBe(true);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, 181)).toBe(false);
    expect(isValidLatLng(NaN, 0)).toBe(false);
    expect(isValidLatLng("1" as unknown, 0)).toBe(false);
  });
});

describe("envío por distancia", () => {
  it("sin ubicación del local ni zonas por distancia: no disponible, se usan las zonas por nombre", async () => {
    expect((await quoteDelivery(north(1))).status).toBe("unavailable");
    await upsertDeliveryZone("Centro", 2000);
    const o = await order(north(1), "Centro");
    expect(o.shippingCost).toBe(2000);
    expect(o.deliveryZone).toBe("Centro");
  });

  it("con local y anillos, el servidor elige la zona por kilómetros y el costo real", async () => {
    await setLocalLocation(LOCAL);
    expect(await getLocalLocation()).toEqual(LOCAL);
    await upsertDeliveryZone("Hasta 2 km", 1500, 2);
    await upsertDeliveryZone("Hasta 5 km", 3000, 5);

    const zones = await listDeliveryZones();
    expect(zones.map((z) => [z.name, z.maxKm])).toEqual([
      ["Hasta 2 km", 2],
      ["Hasta 5 km", 5],
      ["Centro", null],
    ]);

    const near = await order(north(1.2));
    expect(near.deliveryZone).toBe("Hasta 2 km");
    expect(near.shippingCost).toBe(1500);
    expect(near.deliveryLat).toBeCloseTo(north(1.2).lat, 6);

    const far = await order(north(3.5));
    expect(far.deliveryZone).toBe("Hasta 5 km");
    expect(far.shippingCost).toBe(3000);
    expect(far.total).toBe(far.items[0].price + 3000);
  });

  it("justo debajo del límite entra en la zona y justo encima va a la siguiente", async () => {
    expect(((await quoteDelivery(north(1.99))) as { zone: { name: string } }).zone.name).toBe("Hasta 2 km");
    expect(((await quoteDelivery(north(2.05))) as { zone: { name: string } }).zone.name).toBe("Hasta 5 km");
  });

  it("fuera del último anillo se rechaza el pedido", async () => {
    const quote = await quoteDelivery(north(8));
    expect(quote).toMatchObject({ status: "out_of_range", maxKm: 5 });
    await expect(order(north(8))).rejects.toThrow("fuera de la zona de reparto");
  });

  it("no se puede conseguir una zona por distancia sin marcar el mapa (el nombre solo no alcanza)", async () => {
    await expect(order(null, "Hasta 2 km")).rejects.toThrow("Marcá tu dirección en el mapa");
  });

  it("una zona por nombre sigue funcionando aunque haya anillos, y el costo enviado por el cliente se ignora", async () => {
    const o = await order(null, "Centro");
    expect(o.shippingCost).toBe(2000);
    expect(o.deliveryLat).toBeNull();
  });

  it("coordenadas inválidas no cuentan: cae a la zona por nombre", async () => {
    const o = await order({ lat: 500, lng: 0 }, "Centro");
    expect(o.shippingCost).toBe(2000);
    expect(o.deliveryLat).toBeNull();
  });

  it("kilómetros inválidos al crear una zona se rechazan", async () => {
    await expect(upsertDeliveryZone("Mala", 100, -3)).rejects.toThrow("kilómetros");
    await expect(upsertDeliveryZone("Mala", 100, 9999)).rejects.toThrow("kilómetros");
  });
});

describe("búsqueda de direcciones (OpenStreetMap)", () => {
  it("se identifica con User-Agent, prioriza cerca del local y guarda el resultado repetido", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([{ display_name: "Calle Falsa 123, Ciudad", lat: "-27.41", lon: "-55.91" }]), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await searchAddress("Calle Falsa 123", LOCAL);
    expect(first).toEqual([{ label: "Calle Falsa 123, Ciudad", lat: -27.41, lng: -55.91 }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toContain("nominatim.openstreetmap.org/search");
    expect(url).toContain("countrycodes=ar");
    expect(url).toContain("viewbox=");
    expect(init.headers["User-Agent"]).toContain("MaderoSys");

    await searchAddress("Calle Falsa 123", LOCAL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("textos muy cortos no consultan nada y un error de OpenStreetMap se propaga", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchAddress("ab")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(searchAddress("Avenida Siempre Viva")).rejects.toThrow();
  });

  it("geocodificación inversa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ display_name: "Algún lugar" }), { status: 200 })));
    expect(await reverseAddress({ lat: -27.4, lng: -55.9 })).toMatchObject({ label: "Algún lugar" });
    expect(await reverseAddress({ lat: 999, lng: 0 })).toBeNull();
  });
});
