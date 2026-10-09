import { getPool } from "@/lib/admin/db";
import { haversineKm, isValidLatLng, type LatLng } from "@/lib/geo";

export interface DistanceZone {
  id: number;
  name: string;
  cost: number;
  maxKm: number;
}

export type DeliveryQuote =
  // Hay envío por distancia y la dirección entra en alguna zona.
  | { status: "ok"; km: number; zone: DistanceZone }
  // Hay envío por distancia pero la dirección queda más lejos que la última zona.
  | { status: "out_of_range"; km: number; maxKm: number }
  // No hay ubicación del local o no hay zonas por distancia: se usan las zonas por nombre.
  | { status: "unavailable" };

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : null;
}

export async function getLocalLocation(): Promise<LatLng | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ latitude: string | number | null; longitude: string | number | null }>(
    "select latitude, longitude from gestion_business_config where id = 1"
  );
  const lat = num(rows[0]?.latitude);
  const lng = num(rows[0]?.longitude);
  return lat !== null && lng !== null && isValidLatLng(lat, lng) ? { lat, lng } : null;
}

export async function setLocalLocation(location: LatLng | null) {
  const pool = getPool();
  if (location && !isValidLatLng(location.lat, location.lng)) throw new Error("Ubicación inválida");
  await pool.query(
    `insert into gestion_business_config (id, latitude, longitude) values (1, $1, $2)
     on conflict (id) do update set latitude = excluded.latitude, longitude = excluded.longitude`,
    [location?.lat ?? null, location?.lng ?? null]
  );
}

// Zonas por distancia, de la más cercana a la más lejana.
export async function listDistanceZones(): Promise<DistanceZone[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select id, name, cost, max_km from gestion_delivery_zones where max_km is not null order by max_km"
  );
  return rows.map((r) => ({ id: r.id, name: r.name, cost: num(r.cost) ?? 0, maxKm: num(r.max_km) ?? 0 }));
}

// Quién decide el precio del envío es SIEMPRE el servidor: el navegador solo
// manda dónde está el cliente, nunca cuánto cuesta.
export async function quoteDelivery(point: LatLng): Promise<DeliveryQuote> {
  if (!isValidLatLng(point.lat, point.lng)) throw new Error("Ubicación inválida");
  const [origin, zones] = await Promise.all([getLocalLocation(), listDistanceZones()]);
  if (!origin || zones.length === 0) return { status: "unavailable" };

  const km = haversineKm(origin, point);
  const zone = zones.find((z) => km <= z.maxKm);
  if (!zone) return { status: "out_of_range", km, maxKm: zones[zones.length - 1].maxKm };
  return { status: "ok", km, zone };
}
