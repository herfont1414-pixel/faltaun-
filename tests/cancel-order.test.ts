import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { anyInStockProduct, seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import {
  addItem,
  cancelOpenOrder,
  cancelStaleOpenOrders,
  createCounterOrder,
  createDeliveryOrder,
  finalizeOrder,
  getState,
  openTable,
} from "@/lib/admin/store";
import { createWebOrder, listWebOrders, respondWebOrder } from "@/lib/admin/web-orders";
import { POST as cancelPost } from "@/app/api/admin/cancel-order/route";
import { POST as cancelStalePost } from "@/app/api/admin/cancel-stale-orders/route";

let dbPath: string;
let product: { id: number; name: string; price: number };
let mozoId: number;
let encargadoId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("cancel-order");
  product = await anyInStockProduct();
  const mk = async (name: string, role: string) =>
    Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true) returning id", [name, hashPin("4321"), role])).rows[0].id);
  mozoId = await mk("Mozo C", "mozo");
  encargadoId = await mk("Encargado C", "encargado");
});
afterAll(() => tearDownTestDb(dbPath));

const tableStatus = async (n: number) => (await getPool().query("select status from gestion_tables where number = $1", [n])).rows[0].status;
const orderExists = async (id: string) => (await getPool().query("select 1 from gestion_orders where id = $1", [id])).rows.length > 0;
const backdate = (id: string, iso: string) => getPool().query("update gestion_orders set opened_at = $2 where id = $1", [id, iso]);

describe("anular pedidos abiertos", () => {
  it("anula una mesa abierta: borra el pedido, libera la mesa y queda en la auditoría con lo que tenía", async () => {
    const order = await openTable(7);
    await addItem(order.id, product.id);
    await addItem(order.id, product.id);
    expect(await tableStatus(7)).not.toBe("libre");

    const result = await cancelOpenOrder(order.id, encargadoId, "Mesa de prueba");
    expect(result).toMatchObject({ tableNumber: 7, total: product.price * 2 });
    expect(await orderExists(order.id)).toBe(false);
    expect(await tableStatus(7)).toBe("libre");
    const items = await getPool().query("select 1 from gestion_order_items where order_id = $1", [order.id]);
    expect(items.rows).toHaveLength(0);

    const { rows } = await getPool().query("select user_id, old_value, new_value from gestion_audit_log where action = 'order_cancel' and entity_id = $1", [order.id]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].user_id)).toBe(encargadoId);
    const old = typeof rows[0].old_value === "string" ? JSON.parse(rows[0].old_value) : rows[0].old_value;
    expect(old).toMatchObject({ mesa: 7, total: product.price * 2, items: [{ producto: product.name, cantidad: 2 }] });
    const nv = typeof rows[0].new_value === "string" ? JSON.parse(rows[0].new_value) : rows[0].new_value;
    expect(nv).toEqual({ motivo: "Mesa de prueba" });

    // La mesa se puede volver a abrir normalmente.
    const again = await openTable(7);
    expect(again.id).not.toBe(order.id);
    await cancelOpenOrder(again.id, encargadoId);
  });

  it("no anula pedidos cobrados (son ventas) ni pedidos que no existen", async () => {
    const order = await createCounterOrder();
    await addItem(order.id, product.id);
    await finalizeOrder(order.id, [{ method: "efectivo", amount: product.price } as never], null, null);
    await expect(cancelOpenOrder(order.id, encargadoId)).rejects.toThrow(/Solo se pueden anular pedidos abiertos/);
    expect(await orderExists(order.id)).toBe(true);
    await expect(cancelOpenOrder("999999", encargadoId)).rejects.toThrow(/no existe/);
  });

  it("un delivery que vino del menú online queda como rechazado", async () => {
    const web = await createWebOrder({
      customerName: "Lu",
      customerPhone: "5491100000077",
      notes: null,
      customerAddress: null,
      deliveryZone: null,
      items: [{ name: product.name, qty: 1 }],
      fulfillment: "retiro",
    });
    const { orderId } = await respondWebOrder(web.id, "confirmado", 20);
    await cancelOpenOrder(orderId!, encargadoId);
    const listed = (await listWebOrders()).find((o) => o.id === web.id)!;
    expect(listed.status).toBe("rechazado");
    expect(listed.orderId).toBeFalsy();
  });

  it("'días anteriores' anula solo lo abierto antes de las 6:00 de hoy", async () => {
    const now = new Date("2030-05-20T18:00:00.000Z"); // 20/05 15:00 en Argentina
    const ayer = await openTable(3);
    await addItem(ayer.id, product.id);
    await backdate(ayer.id, "2030-05-19T23:00:00.000Z"); // 19/05 20:00
    const madrugada = await createDeliveryOrder({ name: "Noct", phone: "", address: "X", zone: null, shippingCost: 1000, channel: "mostrador" });
    await backdate(madrugada.id, "2030-05-20T08:30:00.000Z"); // 20/05 5:30 → jornada anterior
    const hoy = await openTable(4);
    await backdate(hoy.id, "2030-05-20T09:30:00.000Z"); // 20/05 6:30 → hoy

    const result = await cancelStaleOpenOrders(encargadoId, now);
    expect(result).toEqual({ count: 2, total: product.price + 1000 });
    expect(await orderExists(ayer.id)).toBe(false);
    expect(await orderExists(madrugada.id)).toBe(false);
    expect(await orderExists(hoy.id)).toBe(true);
    expect(await tableStatus(3)).toBe("libre");
    expect(await tableStatus(4)).not.toBe("libre");
    const state = await getState();
    expect(state.openOrders.map((o) => o.id)).toContain(hoy.id);
    await cancelOpenOrder(hoy.id, encargadoId);
  });

  it("solo admin y encargado pueden anular (un mozo no)", async () => {
    const req = async (userId: number | null, url: string, body: unknown) =>
      new NextRequest(`http://localhost${url}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(userId ? { cookie: `${SESSION_COOKIE}=${await createSession(userId)}` } : {}) },
        body: JSON.stringify(body),
      });
    const order = await openTable(9);
    expect((await cancelPost(await req(null, "/api/admin/cancel-order", { orderId: order.id }))).status).toBe(401);
    expect((await cancelPost(await req(mozoId, "/api/admin/cancel-order", { orderId: order.id }))).status).toBe(401);
    expect((await cancelStalePost(await req(mozoId, "/api/admin/cancel-stale-orders", {}))).status).toBe(401);
    expect(await orderExists(order.id)).toBe(true);

    const res = await cancelPost(await req(encargadoId, "/api/admin/cancel-order", { orderId: order.id, reason: "  error  " }));
    expect(res.status).toBe(200);
    expect(await orderExists(order.id)).toBe(false);
    const { rows } = await getPool().query("select new_value from gestion_audit_log where action = 'order_cancel' and entity_id = $1", [order.id]);
    const nv = typeof rows[0].new_value === "string" ? JSON.parse(rows[0].new_value) : rows[0].new_value;
    expect(nv).toEqual({ motivo: "error" });

    const stale = await cancelStalePost(await req(encargadoId, "/api/admin/cancel-stale-orders", {}));
    expect(stale.status).toBe(200);
  });
});
