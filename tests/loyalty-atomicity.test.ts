import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb, anyInStockProduct, nextDay } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { hashPin, createSession, SESSION_COOKIE } from "@/lib/admin/auth";
import { addStamp, getLoyalty, listGrantsForPhone, resolveLoyaltyPhone } from "@/lib/admin/loyalty";
import { createWebOrder, respondWebOrder } from "@/lib/admin/web-orders";
import { createCounterOrder, addItem } from "@/lib/admin/store";
import { POST as finalizePost } from "@/app/api/admin/finalize-order/route";
import { GET as publicGet } from "@/app/api/customer/[phone]/loyalty/route";

let dbPath: string;
let adminId: number;
let product: { id: number; name: string; price: number };
let n = 0;

async function accounts() {
  return (await getPool().query("select phone, stamps, order_count from gestion_loyalty_accounts order by phone")).rows.map((r: any) => ({
    phone: r.phone as string,
    stamps: Number(r.stamps),
    order_count: Number(r.order_count),
  }));
}
const stampTx = async (orderId: string) =>
  Number((await getPool().query("select count(*) as n from gestion_loyalty_transactions where order_id = $1 and type = 'stamp'", [orderId])).rows[0].n);
const grantsOf = async (phone: string) => (await listGrantsForPhone(phone)).map((g) => `${g.rewardCode}@${g.milestone}:${g.status}`).sort();
const legacyAccount = (phone: string, stamps: number) =>
  getPool().query("insert into gestion_loyalty_accounts (phone, stamps, order_count) values ($1, $2, $2)", [phone, stamps]);

const stampsOf = async (phone: string) =>
  Number((await getPool().query("select stamps from gestion_loyalty_accounts where phone = $1", [phone])).rows[0]?.stamps ?? 0);

// Simula que pasó el tiempo desde el cobro (el reintento humano llega pasados unos segundos).
const ageOrder = (id: string, ms: number) =>
  getPool().query("update gestion_orders set closed_at = $2 where id = $1", [id, new Date(Date.now() - ms).toISOString()]);

async function breakGrants() {
  await getPool().query("alter table gestion_loyalty_grants rename to gestion_loyalty_grants_off");
}
async function fixGrants() {
  await getPool().query("alter table gestion_loyalty_grants_off rename to gestion_loyalty_grants");
}

async function cookieFor(userId: number) {
  return `${SESSION_COOKIE}=${await createSession(userId)}`;
}
async function finalize(orderId: string, total: number, loyaltyPhone: string | null) {
  const req = new NextRequest("http://localhost/api/admin/finalize-order", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: await cookieFor(adminId) },
    body: JSON.stringify({ orderId, payments: [{ method: "efectivo", amount: total }], customerId: null, loyaltyPhone }),
  });
  const res = await finalizePost(req);
  return { status: res.status, body: await res.json() };
}
async function counterOrder(qty = 1) {
  const order = await createCounterOrder("mostrador");
  for (let i = 0; i < qty; i++) await addItem(order.id, product.id);
  return { id: order.id as string, total: product.price * qty };
}
async function webOrder(phone: string) {
  const web = await createWebOrder({
    customerName: "Cliente Web",
    customerPhone: phone,
    notes: null,
    items: [{ name: product.name, qty: 1 }],
    fulfillment: "retiro",
    customerAddress: null,
    deliveryZone: null,
  });
  return web.id as string;
}
const orderStatus = async (id: string) => (await getPool().query("select status from gestion_orders where id = $1", [id])).rows[0]?.status;
const paymentsCount = async (id: string) =>
  Number((await getPool().query("select count(*) as n from gestion_order_payments where order_id = $1", [id])).rows[0].n);

beforeAll(async () => {
  dbPath = await seedFreshDb("loyalty-atomicity");
  const { rows } = await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ('Admin T', $1, 'admin', true) returning id", [hashPin("1234")]);
  adminId = Number(rows[0].id);
  const p = await anyInStockProduct();
  product = { id: p.id, name: p.name, price: p.price };
});
afterAll(() => tearDownTestDb(dbPath));

describe("1 · atomicidad: sello + cuenta + premio en una sola transacción", () => {
  it("si falla la generación del premio no queda NADA (ni sello ni cuenta) y reintentar completa todo una sola vez", async () => {
    const phone = "5493000700001";
    await legacyAccount(phone, 4);
    await breakGrants();
    const before = await accounts();
    await expect(addStamp(phone, "orden-atomica-1", { orderTotal: 100 })).rejects.toThrow();
    // Nada a medias: sin transacción de sello, cuenta intacta.
    expect(await stampTx("orden-atomica-1")).toBe(0);
    expect(await accounts()).toEqual(before);
    await fixGrants();

    // Reintento seguro con el mismo pedido: sello + premio, una sola vez.
    const acc = await addStamp(phone, "orden-atomica-1", { orderTotal: 100 });
    expect(acc.stamps).toBe(5);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
    await addStamp(phone, "orden-atomica-1", { orderTotal: 100 });
    await addStamp(phone, "orden-atomica-1", { orderTotal: 100 });
    expect((await getLoyalty(phone)).stamps).toBe(5);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
    expect(await stampTx("orden-atomica-1")).toBe(1);
  });

  it("aceptar un pedido web NO suma sello (aunque falle la tabla de premios, aceptar funciona); el sello y el premio llegan al cobrarlo", async () => {
    const phone = "5493000700002";
    await legacyAccount(phone, 4);
    const webId = await webOrder(phone);
    await breakGrants();
    // Aceptar ya no toca la fidelidad: funciona aunque la tabla de premios esté rota.
    const { orderId } = await respondWebOrder(webId, "confirmado", 20);
    expect(orderId).toBeTruthy();
    expect(await stampTx(webId)).toBe(0);
    expect(await stampsOf(phone)).toBe(4);
    await fixGrants();

    // Al cobrarlo (sin cargar el teléfono a mano) suma el sello con el teléfono del pedido.
    const cobro = await finalize(orderId!, product.price, null);
    expect(cobro.status).toBe(200);
    expect(cobro.body.result.loyalty).toMatchObject({ awarded: true });
    expect((await getLoyalty(phone)).stamps).toBe(5);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
    expect(await stampTx(webId)).toBe(1);
  });

  it("un pedido web aceptado que nunca se cobra no deja sello", async () => {
    const phone = "5493000700010";
    const webId = await webOrder(phone);
    await respondWebOrder(webId, "confirmado", 20);
    expect(await stampTx(webId)).toBe(0);
    expect((await getLoyalty(phone)).stamps).toBe(0);
  });
});

describe("3 · reintentos y doble procesamiento no duplican sellos ni premios", () => {
  it("aceptar el mismo pedido web varias veces (secuencial y simultáneo): 1 pedido real y 0 sellos; al cobrarlo, 1 sello y 1 premio", async () => {
    const phone = "5493000700003";
    await legacyAccount(phone, 4);
    const webId = await webOrder(phone);
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => respondWebOrder(webId, "confirmado", 20)));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const { orderId } = await respondWebOrder(webId, "confirmado", 20);
    expect(await stampTx(webId)).toBe(0);
    const { rows } = await getPool().query("select count(*) as n from gestion_orders where id in (select order_id from gestion_web_orders where id = $1)", [webId]);
    expect(Number(rows[0].n)).toBe(1);

    expect((await finalize(orderId!, product.price, null)).status).toBe(200);
    expect((await getLoyalty(phone)).stamps).toBe(5);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
    expect(await stampTx(webId)).toBe(1);
  });

  it("pedido web cobrado en el panel con el teléfono escrito en otro formato: 1 sello en la misma cuenta", async () => {
    const phone = "5493000700004";
    const webId = await webOrder(phone);
    const { orderId } = await respondWebOrder(webId, "confirmado", 20);
    expect((await getLoyalty(phone)).stamps).toBe(0);

    const cobro = await finalize(orderId!, product.price, "+54 9 300 0700004");
    expect(cobro.status).toBe(200);
    expect((await getLoyalty(phone)).stamps).toBe(1);
    expect(await stampTx(webId)).toBe(1);
    expect(await stampTx(orderId!)).toBe(0); // la clave es el id del pedido web
    expect((await accounts()).filter((a) => a.phone.includes("0700004"))).toHaveLength(1);
  });

  it("cobro del panel repetido (reintento / doble clic): un solo cobro y un solo sello; el segundo recibe 'ya fue cerrado'", async () => {
    const phone = "5493000700005";
    const o = await counterOrder();
    const first = await finalize(o.id, o.total, phone);
    expect(first.status).toBe(200);
    const second = await finalize(o.id, o.total, phone);
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/ya fue cerrado/);
    expect((await getLoyalty(phone)).stamps).toBe(1);
    expect(await paymentsCount(o.id)).toBe(1);
  });

  it("cobros simultáneos del mismo pedido: se cobra una vez y se suma un sello", async () => {
    const phone = "5493000700006";
    const o = await counterOrder();
    const results = await Promise.all([1, 2, 3, 4].map(() => finalize(o.id, o.total, phone)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await getLoyalty(phone)).stamps).toBe(1);
    expect(await paymentsCount(o.id)).toBe(1);
  });

  it("tope diario: dos cobros el mismo día con el mismo teléfono cobran los dos, pero solo el primero suma sello", async () => {
    const phone = "5493000700007";
    await legacyAccount(phone, 3);
    const a = await counterOrder();
    const b = await counterOrder();
    const first = await finalize(a.id, a.total, phone);
    const second = await finalize(b.id, b.total, phone);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.result.loyalty).toMatchObject({ awarded: true });
    expect(second.body.result.loyalty).toMatchObject({ awarded: false, reason: "daily_cap" });
    expect(await orderStatus(b.id)).toBe("cerrada");
    expect(await paymentsCount(b.id)).toBe(1);
    expect((await getLoyalty(phone)).stamps).toBe(4);
    expect(await stampTx(b.id)).toBe(0);

    // Un reintento del segundo cobro (pasados unos segundos) NO se toma por recuperación:
    // no había sello pendiente (fue el tope), así que es "ya fue cerrado" y no reimprime.
    await ageOrder(b.id, 10_000);
    const retry = await finalize(b.id, b.total, phone);
    expect(retry.status).toBe(400);
    expect(retry.body.error).toMatch(/ya fue cerrado/);
  });

  it("el cobro registra qué usuario dio el sello", async () => {
    const o = await counterOrder();
    await finalize(o.id, o.total, "5493000700011");
    const { rows } = await getPool().query("select user_id from gestion_loyalty_transactions where order_id = $1", [o.id]);
    expect(Number(rows[0].user_id)).toBe(adminId);
  });

  it("si el cobro se registra pero falla el sello: se avisa, el cobro NO se repite y reintentar completa solo el sello (y el premio)", async () => {
    const phone = "5493000700008";
    await legacyAccount(phone, 4);
    const o = await counterOrder();
    await breakGrants();
    const first = await finalize(o.id, o.total, phone);
    expect(first.status).toBe(400);
    expect(first.body.error).toMatch(/cobro se registró.*sello/i);
    // El cobro quedó hecho una sola vez; el sello no.
    expect(await orderStatus(o.id)).toBe("cerrada");
    expect(await paymentsCount(o.id)).toBe(1);
    expect(await stampTx(o.id)).toBe(0);
    await fixGrants();

    // Un reintento inmediato (doble clic) NO se toma por recuperación: sigue el error normal.
    const tooSoon = await finalize(o.id, o.total, phone);
    expect(tooSoon.status).toBe(400);
    expect(tooSoon.body.error).toMatch(/ya fue cerrado/);
    expect(await stampTx(o.id)).toBe(0);

    await ageOrder(o.id, 10_000); // pasan unos segundos: el reintento humano
    const retry = await finalize(o.id, o.total, phone); // "tocar cobrar de nuevo"
    expect(retry.status).toBe(200);
    expect((await getLoyalty(phone)).stamps).toBe(5);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
    expect(await paymentsCount(o.id)).toBe(1); // sin segundo cobro

    // Y ya no admite más reintentos: el sello existe, vuelve el error normal.
    const again = await finalize(o.id, o.total, phone);
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/ya fue cerrado/);
    expect((await getLoyalty(phone)).stamps).toBe(5);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
  });

  it("la recuperación no sirve para sumar sellos a pedidos viejos ni sin teléfono", async () => {
    const o = await counterOrder();
    expect((await finalize(o.id, o.total, null)).status).toBe(200);
    // Reintento sin teléfono: error normal.
    expect((await finalize(o.id, o.total, null)).status).toBe(400);
    // Con teléfono pero pasada la ventana: error normal y ningún sello.
    await ageOrder(o.id, 3 * 3600 * 1000);
    const late = await finalize(o.id, o.total, "5493000700009");
    expect(late.status).toBe(400);
    expect(await stampTx(o.id)).toBe(0);
  });
});

describe("2 · identificación del cliente: un mismo teléfono escrito distinto no crea otra cuenta", () => {
  const variants = ["3755589363", "+54 9 3755 58-9363", "03755 15-589363", "5493755589363", "543755589363"];

  it("la primera carga crea la cuenta con el texto tal cual; las otras formas la encuentran y suman ahí", async () => {
    for (const [i, v] of variants.entries()) await addStamp(v, `variante-${i}`, { orderTotal: 10, name: "Ana", now: nextDay() });
    const mine = (await accounts()).filter((a) => a.phone.replace(/\D/g, "").endsWith("3755589363".slice(-8)) || a.phone.includes("589363"));
    expect(mine).toEqual([{ phone: "3755589363", stamps: 5, order_count: 5 }]);
    expect(await grantsOf("3755589363")).toEqual(["papas@5:disponible"]);
    // La tarjeta pública y el resolutor responden con la misma cuenta para cualquier formato.
    for (const v of variants) {
      expect(await resolveLoyaltyPhone(getPool(), v)).toBe("3755589363");
      const res = await publicGet(new NextRequest(`http://localhost/api/customer/${encodeURIComponent(v)}/loyalty`), { params: { phone: v } });
      expect((await res.json()).account.stamps).toBe(5);
    }
  });

  it("un número distinto es otra cuenta; los muy cortos no se normalizan", async () => {
    await addStamp("3755000111", "otro-1", {});
    await addStamp("12345", "corto-1", {});
    await addStamp("012345", "corto-2", {});
    const phones = (await accounts()).map((a) => a.phone);
    expect(phones).toEqual(expect.arrayContaining(["3755000111", "12345", "012345"]));
  });

  it("no modifica ni combina cuentas existentes: con duplicados viejos suma en una (la de más sellos) y deja las otras idénticas", async () => {
    await legacyAccount("3751111222", 2);
    await legacyAccount("+54 9 3751 11-1222", 7);
    await legacyAccount("5493751111222", 3);
    const before = await accounts();
    await addStamp("03751 15-111222", "dup-1", {});
    const after = await accounts();
    const changed = after.filter((a, i) => JSON.stringify(a) !== JSON.stringify(before.find((b) => b.phone === a.phone)));
    expect(changed).toEqual([{ phone: "+54 9 3751 11-1222", stamps: 8, order_count: 8 }]);
    expect(after).toHaveLength(before.length); // ninguna cuenta nueva, ninguna borrada
  });

  it("una cuenta con ese texto exacto siempre tiene prioridad", async () => {
    expect(await resolveLoyaltyPhone(getPool(), "3751111222")).toBe("3751111222");
  });
});
