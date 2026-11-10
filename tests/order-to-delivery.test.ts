import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { anyInStockProduct, seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import {
  addItem,
  convertToDelivery,
  createCounterOrder,
  createDeliveryOrder,
  finalizeOrder,
  getState,
  openTable,
  sendToKitchen,
  upsertDeliveryZone,
} from "@/lib/admin/store";
import { createWebOrder, respondWebOrder } from "@/lib/admin/web-orders";
import { POST as convertPost } from "@/app/api/admin/order-to-delivery/route";

let dbPath: string;
let product: { id: number; name: string; price: number };
let mozoId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("order-to-delivery");
  product = await anyInStockProduct();
  await upsertDeliveryZone("Centro", 1500);
  mozoId = Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ('Mozo D', $1, 'mozo', true) returning id", [hashPin("8642")])).rows[0].id);
});
afterAll(() => tearDownTestDb(dbPath));

const customer = { name: "  Ana Prueba ", phone: "3755000123", address: " San Martín 100 ", zone: "Centro" };

describe("pasar un pedido de mostrador a delivery", () => {
  it("conserva productos y comanda, suma el envío de la zona y aparece como delivery", async () => {
    const order = await createCounterOrder("mostrador", { name: "Ana" });
    await addItem(order.id, product.id);
    await sendToKitchen(order.id);
    await getPool().query("update gestion_order_items set comanda_printed_qty = qty where order_id = $1", [order.id]);

    await convertToDelivery(order.id, customer, mozoId);
    const converted = (await getState()).openOrders.find((o) => o.id === order.id)!;
    expect(converted).toMatchObject({
      isDelivery: true,
      customerName: "Ana Prueba",
      customerPhone: "3755000123",
      customerAddress: "San Martín 100",
      deliveryZone: "Centro",
      shippingCost: 1500,
      deliveryStatus: "preparando",
      total: product.price + 1500,
    });
    expect(converted.items).toEqual([expect.objectContaining({ name: product.name, qty: 1, sentToKitchen: true, comandaPrintedQty: 1 })]);

    const agenda = await getPool().query("select name, address from gestion_delivery_customers where phone = '3755000123'");
    expect(agenda.rows[0]).toMatchObject({ name: "Ana Prueba", address: "San Martín 100" });
    const audit = await getPool().query("select user_id from gestion_audit_log where action = 'order_to_delivery' and entity_id = $1", [order.id]);
    expect(Number(audit.rows[0].user_id)).toBe(mozoId);

    // Se cobra como cualquier delivery, con el envío incluido.
    await finalizeOrder(order.id, [{ method: "efectivo", amount: product.price + 1500 } as never], null, null);
  });

  it("sin zona el envío queda en $0", async () => {
    const order = await createCounterOrder();
    await addItem(order.id, product.id);
    await convertToDelivery(order.id, { ...customer, zone: null });
    expect((await getState()).openOrders.find((o) => o.id === order.id)).toMatchObject({ isDelivery: true, shippingCost: 0, total: product.price });
  });

  it("no se puede con mesas, deliverys, cobrados, pedidos web, zona inexistente ni sin datos", async () => {
    const mesa = await openTable(31);
    await expect(convertToDelivery(mesa.id, customer)).rejects.toThrow(/Es una mesa/);
    const delivery = await createDeliveryOrder({ name: "X", phone: "", address: "Y", zone: null, shippingCost: 0 });
    await expect(convertToDelivery(delivery.id, customer)).rejects.toThrow(/ya es de delivery/);

    const cobrado = await createCounterOrder();
    await addItem(cobrado.id, product.id);
    await finalizeOrder(cobrado.id, [{ method: "efectivo", amount: product.price } as never], null, null);
    await expect(convertToDelivery(cobrado.id, customer)).rejects.toThrow(/ya fue cobrado/);

    const abierto = await createCounterOrder();
    await expect(convertToDelivery(abierto.id, { ...customer, address: " " })).rejects.toThrow(/nombre y dirección/);
    await expect(convertToDelivery(abierto.id, { ...customer, zone: "Marte" })).rejects.toThrow(/zona/);
    expect((await getPool().query("select is_delivery from gestion_orders where id = $1", [abierto.id])).rows[0].is_delivery).toBeFalsy();

    const web = await createWebOrder({
      customerName: "Lu",
      customerPhone: "5491100000088",
      notes: null,
      customerAddress: null,
      deliveryZone: null,
      items: [{ name: product.name, qty: 1 }],
      fulfillment: "retiro",
    });
    const { orderId } = await respondWebOrder(web.id, "confirmado", 20);
    await expect(convertToDelivery(orderId!, customer)).rejects.toThrow(/menú online/);
    await expect(convertToDelivery("999999", customer)).rejects.toThrow(/no existe/);
  });

  it("la ruta exige estar logueado y devuelve el estado actualizado", async () => {
    const order = await createCounterOrder();
    const body = { orderId: order.id, ...customer };
    const req = (cookie: string | null) =>
      new NextRequest("http://localhost/api/admin/order-to-delivery", {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      });
    expect((await convertPost(req(null))).status).toBe(401);
    const res = await convertPost(req(`${SESSION_COOKIE}=${await createSession(mozoId)}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.openOrders.find((o: { id: string }) => o.id === order.id).isDelivery).toBe(true);
    const again = await convertPost(req(`${SESSION_COOKIE}=${await createSession(mozoId)}`));
    expect(again.status).toBe(400);
  });
});
