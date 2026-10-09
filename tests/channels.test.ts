import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { createCounterOrder, createDeliveryOrder, openTable, getState, upsertDeliveryZone } from "@/lib/admin/store";
import { createWebOrder, respondWebOrder, listWebOrdersByPhone } from "@/lib/admin/web-orders";
import { setDeliveryStatus, finalizeOrder } from "@/lib/admin/store";
import { getBusinessConfig, updateBusinessConfig } from "@/lib/admin/business-config";
import { getPool } from "@/lib/admin/db";
import { orderTitle } from "@/lib/admin/order-labels";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";

let dbPath: string;
let productName: string;
let price: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("channels");
  const p = await anyInStockProduct();
  productName = p.name;
  price = p.price;
  await upsertDeliveryZone("Centro", 2000);
  await updateBusinessConfig({ transferAlias: "madero.resto" });
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

function web(opts: { fulfillment?: "retiro" | "delivery"; pay?: "efectivo" | "transferencia"; cash?: number | null; phone?: string }) {
  return createWebOrder({
    customerName: "Cliente Web",
    customerPhone: opts.phone ?? "5493751000900",
    notes: null,
    items: [{ name: productName, qty: 1 }],
    fulfillment: opts.fulfillment ?? "retiro",
    customerAddress: opts.fulfillment === "delivery" ? "Calle 9" : null,
    deliveryZone: opts.fulfillment === "delivery" ? "Centro" : null,
    paymentMethod: opts.pay ?? "efectivo",
    cashGiven: opts.cash ?? null,
  });
}

describe("canales de los pedidos", () => {
  it("cada pedido lleva su canal: barra, WhatsApp, web y delivery; las mesas no tienen", async () => {
    const barra = await createCounterOrder();
    const wa = await createCounterOrder("whatsapp", { name: "  Ana ", phone: "3755111" });
    const del = await createDeliveryOrder({ name: "Beto", phone: "3755222", address: "Calle 1", zone: null, shippingCost: 0 });
    const delLocal = await createDeliveryOrder({
      name: "Cris",
      phone: "3755333",
      address: "Calle 2",
      zone: null,
      shippingCost: 0,
      channel: "mostrador",
    });
    const w = await web({ fulfillment: "delivery" });
    const { orderId } = await respondWebOrder(w.id, "confirmado", 30);
    await openTable(1);

    const { openOrders } = await getState();
    const by = (id: string) => openOrders.find((o) => o.id === id)!;
    expect(by(barra.id).channel).toBe("mostrador");
    expect(by(wa.id)).toMatchObject({ channel: "whatsapp", customerName: "Ana", customerPhone: "3755111" });
    expect(by(del.id)).toMatchObject({ channel: "whatsapp", isDelivery: true });
    expect(by(delLocal.id)).toMatchObject({ channel: "mostrador", isDelivery: true });
    expect(by(orderId!)).toMatchObject({ channel: "web", isDelivery: true });
    const mesa = openOrders.find((o) => o.tableNumber === 1)!;
    expect(mesa.channel).toBeNull();
  });

  it("los títulos del panel dicen de dónde viene el pedido", async () => {
    const { openOrders } = await getState();
    const titles = openOrders.map(orderTitle);
    expect(titles).toContain("WhatsApp · Retiro · Ana");
    expect(titles).toContain("WhatsApp · Delivery · Beto");
    expect(titles).toContain("Delivery · Cris");
    expect(titles).toContain("Web · Delivery · Cliente Web");
    expect(titles).toContain(null); // barra y mesa usan el título de siempre
  });
});

describe("efectivo: con cuánto paga", () => {
  it("se guarda, se avisa en el pedido real y precarga el cobro", async () => {
    const w = await web({ pay: "efectivo", cash: price + 5000, phone: "5493751000901" });
    expect(w.cashGiven).toBe(price + 5000);
    const { orderId } = await respondWebOrder(w.id, "confirmado", 20);
    const o = (await getState()).openOrders.find((x) => x.id === orderId)!;
    expect(o.paymentHint).toEqual({ method: "efectivo", cashGiven: price + 5000 });
    expect(o.notes).toContain("vuelto $5.000");
  });

  it("no alcanza el total, o no es efectivo: se rechaza / se ignora", async () => {
    await expect(web({ pay: "efectivo", cash: 10 })).rejects.toThrow("no alcanza");
    await expect(web({ pay: "efectivo", cash: -5 })).rejects.toThrow("no es válido");
    const t = await web({ pay: "transferencia", cash: 999999, phone: "5493751000902" });
    expect(t.cashGiven).toBeNull();
    const none = await web({ pay: "efectivo", cash: null, phone: "5493751000903" });
    expect(none.cashGiven).toBeNull();
  });

  it("transferencia queda como aviso para verificar el comprobante", async () => {
    const w = await web({ pay: "transferencia", phone: "5493751000904" });
    const { orderId } = await respondWebOrder(w.id, "confirmado", 20);
    const o = (await getState()).openOrders.find((x) => x.id === orderId)!;
    expect(o.paymentHint).toEqual({ method: "transferencia", cashGiven: null });
  });

  it("el mensaje de WhatsApp incluye con cuánto paga", () => {
    const url = buildOrderWhatsAppLink({
      customerName: "Ana",
      items: [{ name: "Papas", qty: 1, price: 8000 }],
      fulfillment: "delivery",
      subtotal: 8000,
      shippingCost: 0,
      total: 8000,
      paymentMethod: "efectivo",
      cashGiven: 10000,
    });
    expect(decodeURIComponent(url)).toContain("Pago con: $10.000");
  });
});

describe("seguimiento del pedido para el cliente", () => {
  it("delivery: esperando → preparando → en camino → entregado", async () => {
    const phone = "5493751000950";
    const w = await web({ fulfillment: "delivery", phone });
    const progress = async () => (await listWebOrdersByPhone(phone))[0].progress;
    expect(await progress()).toBe("esperando");

    const { orderId } = await respondWebOrder(w.id, "confirmado", 30);
    expect(await progress()).toBe("preparando");

    await setDeliveryStatus(orderId!, "en_camino");
    expect(await progress()).toBe("en_camino");

    await finalizeOrder(orderId!, [{ method: "efectivo", amount: price + 2000 }], null);
    expect(await progress()).toBe("entregado");
  });

  it("retiro: preparando → listo (cocina) → entregado (cobrado)", async () => {
    const phone = "5493751000951";
    const w = await web({ fulfillment: "retiro", phone });
    const { orderId } = await respondWebOrder(w.id, "confirmado", 15);
    const progress = async () => (await listWebOrdersByPhone(phone))[0].progress;
    expect(await progress()).toBe("preparando");

    await getPool().query("update gestion_orders set kitchen_status = 'listo' where id = $1", [orderId]);
    expect(await progress()).toBe("listo");

    await finalizeOrder(orderId!, [{ method: "efectivo", amount: price }], null);
    expect(await progress()).toBe("entregado");
  });

  it("rechazado se ve como rechazado", async () => {
    const phone = "5493751000952";
    const w = await web({ phone });
    await respondWebOrder(w.id, "rechazado", null);
    expect((await listWebOrdersByPhone(phone))[0].progress).toBe("rechazado");
  });

  it("la configuración del alias no se pierde", async () => {
    expect((await getBusinessConfig()).transferAlias).toBe("madero.resto");
  });
});

describe("pedido delivery desde Mostrador (solo nombre y zona)", () => {
  it("sin teléfono ni dirección se crea igual, con su zona y envío, y no ensucia la agenda de clientes", async () => {
    const before = await getPool().query("select count(*) as n from gestion_delivery_customers");
    const o = await createDeliveryOrder({
      name: "  Dani  ",
      phone: "",
      address: "",
      zone: "Centro",
      shippingCost: 2000,
      channel: "whatsapp",
    });
    expect(o).toMatchObject({ customer_name: "Dani", customer_phone: null, customer_address: null, delivery_zone: "Centro" });
    const after = await getPool().query("select count(*) as n from gestion_delivery_customers");
    expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n));
    const open = (await getState()).openOrders.find((x) => x.id === o.id)!;
    expect(open).toMatchObject({ isDelivery: true, channel: "whatsapp", shippingCost: 2000 });
    expect(orderTitle(open)).toBe("WhatsApp · Delivery · Dani");
  });

  it("sin nombre tampoco rompe", async () => {
    const o = await createDeliveryOrder({ name: "", phone: "", address: "", zone: null, shippingCost: 0, channel: "mostrador" });
    expect(o.customer_name).toBeNull();
    expect(o.is_delivery === true || o.is_delivery === 1).toBe(true);
  });
});
