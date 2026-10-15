import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { anyInStockProduct, seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { addItem, createCounterOrder, createDeliveryOrder } from "@/lib/admin/store";
import { POST as finalizePost } from "@/app/api/admin/finalize-order/route";

let dbPath: string;
let adminId: number;
let product: { id: number; price: number };

beforeAll(async () => {
  dbPath = await seedFreshDb("loyalty-order-phone");
  product = await anyInStockProduct();
  adminId = Number(
    (await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ('Caja', $1, 'admin', true) returning id", [hashPin("5555")])).rows[0].id
  );
});
afterAll(() => tearDownTestDb(dbPath));

async function finalize(orderId: string, total: number, loyaltyPhone: string | null) {
  const req = new NextRequest("http://localhost/api/admin/finalize-order", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${await createSession(adminId)}` },
    body: JSON.stringify({ orderId, payments: [{ method: "efectivo", amount: total }], customerId: null, loyaltyPhone }),
  });
  const res = await finalizePost(req);
  return { status: res.status, body: await res.json() };
}
const account = async (phone: string) =>
  (await getPool().query("select name, stamps from gestion_loyalty_accounts where phone = $1", [phone])).rows[0];

describe("sello automático con el teléfono del pedido", () => {
  it("un delivery cargado en el panel con teléfono le arma la tarjeta y suma el sello al cobrar", async () => {
    const o = await createDeliveryOrder({ name: "Tedy Ruppel", phone: "3755 41-2222", address: "Centro", zone: null, shippingCost: 0, channel: "mostrador" });
    await addItem(o.id, product.id);
    const { status, body } = await finalize(o.id, product.price, null);
    expect(status).toBe(200);
    expect(body.result.loyalty).toMatchObject({ awarded: true, stamps: 1 });
    expect(await account("3755 41-2222")).toMatchObject({ name: "Tedy Ruppel", stamps: 1 });
  });

  it("si en el cobro se escribe otro teléfono, manda ese", async () => {
    const o = await createDeliveryOrder({ name: "Ana", phone: "3755 41-3333", address: "", zone: null, shippingCost: 0, channel: "mostrador" });
    await addItem(o.id, product.id);
    await finalize(o.id, product.price, "3755 41-4444");
    expect(await account("3755 41-4444")).toMatchObject({ stamps: 1 });
    expect(await account("3755 41-3333")).toBeUndefined();
  });

  it("sin teléfono, o con un número incompleto, no suma sello ni crea tarjeta", async () => {
    const a = await createCounterOrder("mostrador");
    await addItem(a.id, product.id);
    expect((await finalize(a.id, product.price, null)).body.result.loyalty).toBeNull();
    const b = await createCounterOrder("whatsapp", { name: "Corto", phone: "12345" });
    await addItem(b.id, product.id);
    expect((await finalize(b.id, product.price, null)).body.result.loyalty).toBeNull();
    expect(await account("12345")).toBeUndefined();
  });

  it("sigue el tope de un sello por día", async () => {
    const o = await createDeliveryOrder({ name: "Tedy Ruppel", phone: "3755 41-2222", address: "", zone: null, shippingCost: 0, channel: "mostrador" });
    await addItem(o.id, product.id);
    expect((await finalize(o.id, product.price, null)).body.result.loyalty).toMatchObject({ awarded: false, reason: "daily_cap" });
  });
});
