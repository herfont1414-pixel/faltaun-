import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { hashPin, createSession, SESSION_COOKIE } from "@/lib/admin/auth";
import {
  addStamp,
  getLoyalty,
  listGrantsForPhone,
  listPendingGrants,
  listRewards,
  redeemGrant,
  updateReward,
} from "@/lib/admin/loyalty";
import { hitsAt, milestonesUpTo, nextMilestone, stampsToNext, cycleFilled, cyclePosition } from "@/lib/admin/loyalty-rewards";
import { GET as adminGet } from "@/app/api/admin/loyalty/route";
import { POST as redeemPost } from "@/app/api/admin/loyalty/redeem/route";
import { PATCH as rewardPatch } from "@/app/api/admin/loyalty/rewards/[id]/route";
import { GET as publicGet } from "@/app/api/customer/[phone]/loyalty/route";

let dbPath: string;
let adminId: number;
let encargadoId: number;
let mozoId: number;
let papasId: number;
let burgerProductId: number;
let n = 0;

const papas = { firstMilestone: 5, step: 15 };
const burger = { firstMilestone: 15, step: 15 };

async function stamps(phone: string, count: number) {
  for (let i = 0; i < count; i++) await addStamp(phone, `ord-${phone}-${++n}`, { orderTotal: 100 });
}
// Cuenta con sellos ya cargados "de antes" (sin pasar por addStamp): no genera premios.
async function legacyAccount(phone: string, count: number) {
  await getPool().query("insert into gestion_loyalty_accounts (phone, stamps, order_count) values ($1, $2, $2)", [phone, count]);
}
const grantsOf = async (phone: string) => (await listGrantsForPhone(phone)).map((g) => `${g.rewardCode}@${g.milestone}:${g.status}`).sort();
async function stockOf(id: number) {
  const { rows } = await getPool().query("select stock_qty, in_stock from gestion_products where id = $1", [id]);
  return rows[0] as { stock_qty: number | null; in_stock: boolean };
}
async function movements(grantId: string) {
  const { rows } = await getPool().query(
    "select type, quantity from gestion_stock_movements where reference_type = 'loyalty_reward' and reference_id = $1",
    [grantId]
  );
  return rows.map((r: any) => ({ type: r.type, quantity: Number(r.quantity) }));
}
const grantId = async (phone: string, code: string, milestone: number) =>
  (await listGrantsForPhone(phone)).find((g) => g.rewardCode === code && g.milestone === milestone)!.id;

async function makeUser(name: string, role: string) {
  const { rows } = await getPool().query(
    "insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true) returning id",
    [name, hashPin("1234"), role]
  );
  return Number(rows[0].id);
}
async function req(userId: number | null, url: string, init?: { method?: string; body?: unknown }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (userId) headers.cookie = `${SESSION_COOKIE}=${await createSession(userId)}`;
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeAll(async () => {
  dbPath = await seedFreshDb("loyalty-rewards");
  const pool = getPool();
  adminId = await makeUser("Admin T", "admin");
  encargadoId = await makeUser("Encargado T", "encargado");
  mozoId = await makeUser("Mozo T", "mozo");
  papasId = Number((await pool.query("select id from gestion_products where name = 'Papas Fritas'")).rows[0].id);
  burgerProductId = Number((await pool.query("select id from gestion_products where name = 'Burger Chedar'")).rows[0].id);
});

afterAll(() => tearDownTestDb(dbPath));

describe("hitos repetidos (reglas puras)", () => {
  it("papas en 5, 20, 35, 50… y hamburguesa en 15, 30, 45, 60…", () => {
    expect([4, 5, 6, 19, 20, 35, 50, 51].filter((s) => hitsAt(papas, s))).toEqual([5, 20, 35, 50]);
    expect([14, 15, 16, 30, 45, 60].filter((s) => hitsAt(burger, s))).toEqual([15, 30, 45, 60]);
    expect(milestonesUpTo(papas, 50)).toEqual([5, 20, 35, 50]);
    expect(milestonesUpTo(burger, 60)).toEqual([15, 30, 45, 60]);
  });
  it("próximo hito y casilleros de la tarjeta", () => {
    expect(nextMilestone(papas, 4)).toBe(5);
    expect(nextMilestone(papas, 5)).toBe(20);
    expect(nextMilestone(burger, 15)).toBe(30);
    expect(stampsToNext([papas, burger], 5)).toMatchObject({ milestone: 15, remaining: 10 });
    expect(stampsToNext([papas, burger], 15)).toMatchObject({ milestone: 20, remaining: 5 });
    expect(cycleFilled(0, 15)).toBe(0);
    expect(cycleFilled(15, 15)).toBe(15);
    expect(cycleFilled(16, 15)).toBe(1);
    expect(cyclePosition(5, 15)).toBe(5);
    expect(cyclePosition(30, 15)).toBe(15);
  });
});

describe("premios por defecto", () => {
  it("papas queda vinculado al producto 'Papas Fritas' por ID (sin precio) y la hamburguesa a ningún producto", async () => {
    const rewards = await listRewards();
    const p = rewards.find((r) => r.code === "papas")!;
    const b = rewards.find((r) => r.code === "burger")!;
    expect([p.firstMilestone, p.step, p.productId, p.productName]).toEqual([5, 15, papasId, "Papas Fritas"]);
    expect([b.firstMilestone, b.step, b.productId]).toEqual([15, 15, null]);
    expect(b.description).toMatch(/simple/i);
    expect(b.description).toMatch(/no incluye dobles ni triples/i);
    const cols = (await getPool().query("select * from gestion_loyalty_rewards limit 1")).rows[0];
    expect(Object.keys(cols).join(",")).not.toMatch(/price|precio/i);
  });
});

describe("generación de premios al acumular sellos", () => {
  it("5 → papas; 15 → hamburguesa; 20 → otra de papas; ambos pendientes a la vez; los sellos siguen", async () => {
    const phone = "5493000100001";
    await stamps(phone, 4);
    expect(await grantsOf(phone)).toEqual([]);
    await stamps(phone, 1);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
    await stamps(phone, 10); // 15
    expect(await grantsOf(phone)).toEqual(["burger@15:disponible", "papas@5:disponible"]);
    await stamps(phone, 5); // 20
    expect(await grantsOf(phone)).toEqual(["burger@15:disponible", "papas@20:disponible", "papas@5:disponible"]);
    const acc = await getLoyalty(phone);
    expect(acc.stamps).toBe(20);
    expect(acc.rewardsAvailable).toBe(3);
  });

  it("llega hasta 60 y cada hito genera su premio una sola vez", async () => {
    const phone = "5493000100002";
    await stamps(phone, 60);
    expect(await grantsOf(phone)).toEqual(
      [
        "papas@5", "papas@20", "papas@35", "papas@50",
        "burger@15", "burger@30", "burger@45", "burger@60",
      ].map((x) => `${x}:disponible`).sort()
    );
  });

  it("el mismo pedido dos veces no suma sello ni genera premio de más", async () => {
    const phone = "5493000100003";
    await stamps(phone, 4);
    await addStamp(phone, "mismo-pedido", {});
    await addStamp(phone, "mismo-pedido", {});
    await addStamp(phone, "mismo-pedido", {});
    expect((await getLoyalty(phone)).stamps).toBe(5);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
  });

  it("pedidos simultáneos con el mismo id suman un solo sello", async () => {
    const phone = "5493000100004";
    await stamps(phone, 4);
    await Promise.all(Array.from({ length: 6 }, () => addStamp(phone, "pedido-concurrente", {})));
    expect((await getLoyalty(phone)).stamps).toBe(5);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
  });

  it("la base no admite un premio duplicado por cliente e hito", async () => {
    const phone = "5493000100001";
    const reward = (await listRewards()).find((r) => r.code === "papas")!;
    await expect(
      getPool().query("insert into gestion_loyalty_grants (phone, reward_id, milestone) values ($1, $2, 5)", [phone, reward.id])
    ).rejects.toThrow(/unique/i);
  });

  it("NO hay premios retroactivos: sellos de antes no generan premios, solo el hito que se cruza", async () => {
    const a = "5493000100005";
    await legacyAccount(a, 7); // ya había pasado el hito 5
    await stamps(a, 1);
    expect(await grantsOf(a)).toEqual([]);

    const b = "5493000100006";
    await legacyAccount(b, 14);
    await stamps(b, 1); // cruza el 15
    expect(await grantsOf(b)).toEqual(["burger@15:disponible"]); // sin papas@5 retroactivo
  });

  it("la migración no crea premios para las cuentas existentes", async () => {
    const { rows } = await getPool().query("select count(*) as n from gestion_loyalty_grants where phone = '5493000100005'");
    expect(Number(rows[0].n)).toBe(0);
  });

  it("un premio desactivado no se genera", async () => {
    const reward = (await listRewards()).find((r) => r.code === "papas")!;
    await updateReward(reward.id, { active: false }, adminId);
    const phone = "5493000100007";
    await stamps(phone, 5);
    expect(await grantsOf(phone)).toEqual([]);
    await updateReward(reward.id, { active: true }, adminId);
  });
});

describe("canje", () => {
  it("papas: usa el producto vinculado, no toca los sellos ni los otros premios, y no se puede repetir", async () => {
    const phone = "5493000200001";
    await stamps(phone, 15); // papas@5 + burger@15
    const before = await getLoyalty(phone);
    const gid = await grantId(phone, "papas", 5);

    const done = await redeemGrant({ grantId: gid, userId: encargadoId });
    expect(done.status).toBe("canjeado");
    expect(done.deliveredProductName).toBe("Papas Fritas");
    expect(done.redeemedByName).toBe("Encargado T");
    expect(done.redeemedAt).toBeTruthy();

    const after = await getLoyalty(phone);
    expect(after.stamps).toBe(before.stamps); // los sellos no se descuentan
    expect(after.stamps).toBe(15);
    expect(await grantsOf(phone)).toEqual(["burger@15:disponible", "papas@5:canjeado"]);

    await expect(redeemGrant({ grantId: gid, userId: adminId })).rejects.toThrow(/ya fue canjeado/);
    expect((await listGrantsForPhone(phone)).find((g) => g.id === gid)!.redeemedByName).toBe("Encargado T"); // no se pisó
  });

  it("después de canjear sigue acumulando y los siguientes hitos generan premios nuevos", async () => {
    const phone = "5493000200002";
    await stamps(phone, 5);
    await redeemGrant({ grantId: await grantId(phone, "papas", 5), userId: adminId });
    await stamps(phone, 15); // 20 → nuevo premio de papas
    expect(await grantsOf(phone)).toEqual(["burger@15:disponible", "papas@20:disponible", "papas@5:canjeado"]);
  });

  it("hamburguesa: se puede registrar cuál se entregó y también dejarla sin indicar", async () => {
    const phone = "5493000200003";
    await stamps(phone, 15);
    const gid = await grantId(phone, "burger", 15);
    const done = await redeemGrant({ grantId: gid, userId: adminId, productId: burgerProductId, note: "  sin cebolla  " });
    expect(done.deliveredProductName).toBe("Burger Chedar");
    expect(done.note).toBe("sin cebolla");

    const other = "5493000200004";
    await stamps(other, 15);
    const sinProducto = await redeemGrant({ grantId: await grantId(other, "burger", 15), userId: adminId });
    expect(sinProducto.status).toBe("canjeado");
    expect(sinProducto.deliveredProductName).toBeNull();
  });

  it("producto inexistente o premio inexistente: error y el premio sigue pendiente", async () => {
    const phone = "5493000200005";
    await stamps(phone, 15);
    const gid = await grantId(phone, "burger", 15);
    await expect(redeemGrant({ grantId: gid, userId: adminId, productId: 999999 })).rejects.toThrow(/no existe/);
    expect((await grantsOf(phone)).includes("burger@15:disponible")).toBe(true);
    await expect(redeemGrant({ grantId: "no-existe", userId: adminId })).rejects.toThrow(/no existe/);
  });

  it("deja registro de auditoría con quién, qué y cuándo", async () => {
    const phone = "5493000200006";
    await stamps(phone, 5);
    const gid = await grantId(phone, "papas", 5);
    await redeemGrant({ grantId: gid, userId: encargadoId, note: "mesa 4" });
    const { rows } = await getPool().query(
      "select user_id, action, entity, new_value from gestion_audit_log where action = 'loyalty_redeem' and entity_id = $1",
      [gid]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].user_id)).toBe(encargadoId);
    const value = JSON.parse(rows[0].new_value);
    expect(value).toMatchObject({ phone, milestone: 5, product: "Papas Fritas", note: "mesa 4" });
  });
});

describe("canje y stock", () => {
  async function setStock(id: number, qty: number | null, inStock = true) {
    await getPool().query("update gestion_products set stock_qty = $2, in_stock = $3 where id = $1", [id, qty, inStock]);
  }

  it("producto con stock controlado: descuenta exactamente 1 con el mecanismo existente (movimiento en la bitácora)", async () => {
    const phone = "5493000300001";
    await stamps(phone, 5);
    await setStock(papasId, 3);
    const gid = await grantId(phone, "papas", 5);
    await redeemGrant({ grantId: gid, userId: adminId });
    expect(await stockOf(papasId)).toEqual({ stock_qty: 2, in_stock: true });
    expect(await movements(gid)).toEqual([{ type: "ajuste_negativo", quantity: -1 }]);
    // Reintentar no descuenta de nuevo.
    await expect(redeemGrant({ grantId: gid, userId: adminId })).rejects.toThrow(/ya fue canjeado/);
    expect((await stockOf(papasId)).stock_qty).toBe(2);
    expect(await movements(gid)).toHaveLength(1);
  });

  it("al entregar la última unidad el producto queda sin stock", async () => {
    const phone = "5493000300002";
    await stamps(phone, 5);
    await setStock(papasId, 1);
    await redeemGrant({ grantId: await grantId(phone, "papas", 5), userId: adminId });
    expect(await stockOf(papasId)).toEqual({ stock_qty: 0, in_stock: false });
  });

  it("producto agotado: el premio queda pendiente, no se descuenta nada y no se pierde", async () => {
    const phone = "5493000300003";
    await stamps(phone, 5);
    await setStock(papasId, 0, false);
    const gid = await grantId(phone, "papas", 5);
    await expect(redeemGrant({ grantId: gid, userId: adminId })).rejects.toThrow(/agotado.*sigue pendiente/);
    expect(await grantsOf(phone)).toEqual(["papas@5:disponible"]);
    expect(await stockOf(papasId)).toEqual({ stock_qty: 0, in_stock: false });
    expect(await movements(gid)).toHaveLength(0);
    // Cuando se repone, se puede entregar.
    await setStock(papasId, 5);
    await redeemGrant({ grantId: gid, userId: adminId });
    expect((await stockOf(papasId)).stock_qty).toBe(4);
  });

  it("marcado 'sin stock' a mano (sin cantidad): también queda pendiente", async () => {
    const phone = "5493000300004";
    await stamps(phone, 15);
    await setStock(burgerProductId, null, false);
    const gid = await grantId(phone, "burger", 15);
    await expect(redeemGrant({ grantId: gid, userId: adminId, productId: burgerProductId })).rejects.toThrow(/agotado/);
    expect((await grantsOf(phone)).includes("burger@15:disponible")).toBe(true);
    await setStock(burgerProductId, null, true);
  });

  it("producto SIN control de stock: se registra la entrega y no se inventa un descuento", async () => {
    const phone = "5493000300005";
    await stamps(phone, 5);
    await setStock(papasId, null, true);
    const gid = await grantId(phone, "papas", 5);
    await redeemGrant({ grantId: gid, userId: adminId });
    expect(await stockOf(papasId)).toEqual({ stock_qty: null, in_stock: true });
    expect(await movements(gid)).toHaveLength(0);
  });

  it("canjes simultáneos del MISMO premio: gana uno solo y el stock se descuenta una vez", async () => {
    const phone = "5493000300006";
    await stamps(phone, 5);
    await setStock(papasId, 10);
    const gid = await grantId(phone, "papas", 5);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => redeemGrant({ grantId: gid, userId: i % 2 ? adminId : encargadoId }))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(7);
    expect((await stockOf(papasId)).stock_qty).toBe(9);
    expect(await movements(gid)).toHaveLength(1);
    const { rows } = await getPool().query("select count(*) as n from gestion_audit_log where action = 'loyalty_redeem' and entity_id = $1", [gid]);
    expect(Number(rows[0].n)).toBe(1);
  });

  it("canjes simultáneos de premios distintos sobre el mismo producto: no sobrevende", async () => {
    await setStock(papasId, 2);
    const phones = ["5493000300007", "5493000300008", "5493000300009"];
    for (const p of phones) await stamps(p, 5);
    const ids = await Promise.all(phones.map((p) => grantId(p, "papas", 5)));
    const results = await Promise.allSettled(ids.map((id) => redeemGrant({ grantId: id, userId: adminId })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await stockOf(papasId)).stock_qty).toBe(0);
    // El tercero sigue pendiente (no se perdió).
    const pendientes = await listPendingGrants(500);
    expect(pendientes.filter((g) => ids.includes(g.id))).toHaveLength(1);
  });
});

describe("permisos y API", () => {
  it("sin sesión o con rol mozo: 401 en lectura, canje y edición de premios", async () => {
    const phone = "5493000400001";
    await stamps(phone, 5);
    const gid = await grantId(phone, "papas", 5);
    for (const user of [null, mozoId]) {
      expect((await adminGet(await req(user, "/api/admin/loyalty"))).status).toBe(401);
      expect((await redeemPost(await req(user, "/api/admin/loyalty/redeem", { method: "POST", body: { grantId: gid } }))).status).toBe(401);
      expect(
        (await rewardPatch(await req(user, "/api/admin/loyalty/rewards/1", { method: "PATCH", body: { active: false } }), { params: { id: "1" } })).status
      ).toBe(401);
    }
    expect((await grantsOf(phone)).includes("papas@5:disponible")).toBe(true);
  });

  it("admin y encargado: pueden consultar, canjear y editar premios; las entradas inválidas se rechazan", async () => {
    const phone = "5493000400002";
    await stamps(phone, 5);
    await getPool().query("update gestion_products set stock_qty = null, in_stock = true where id = $1", [papasId]);
    const list = await adminGet(await req(adminId, "/api/admin/loyalty"));
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.rewards.map((r: any) => r.code)).toEqual(["papas", "burger"]);
    expect(body.pending.some((g: any) => g.phone === phone)).toBe(true);

    const found = await (await adminGet(await req(encargadoId, `/api/admin/loyalty?q=${phone.slice(-6)}`))).json();
    expect(found.results.map((r: any) => r.phone)).toContain(phone);
    const detail = await (await adminGet(await req(encargadoId, `/api/admin/loyalty?phone=${phone}`))).json();
    expect(detail.account.stamps).toBe(5);

    expect((await redeemPost(await req(adminId, "/api/admin/loyalty/redeem", { method: "POST", body: {} }))).status).toBe(400);
    expect((await redeemPost(await req(adminId, "/api/admin/loyalty/redeem", { method: "POST", body: { grantId: "x", productId: "abc" } }))).status).toBe(400);

    const gid = await grantId(phone, "papas", 5);
    const ok = await redeemPost(await req(encargadoId, "/api/admin/loyalty/redeem", { method: "POST", body: { grantId: gid } }));
    expect(ok.status).toBe(200);
    const again = await redeemPost(await req(adminId, "/api/admin/loyalty/redeem", { method: "POST", body: { grantId: gid } }));
    expect(again.status).toBe(400);
    expect((await again.json()).error).toMatch(/ya fue canjeado/);

    const patched = await rewardPatch(
      await req(adminId, "/api/admin/loyalty/rewards/2", { method: "PATCH", body: { description: "Una hamburguesa simple gratis" } }),
      { params: { id: "2" } }
    );
    expect(patched.status).toBe(200);
    const bad = await rewardPatch(await req(adminId, "/api/admin/loyalty/rewards/2", { method: "PATCH", body: { name: "  " } }), { params: { id: "2" } });
    expect(bad.status).toBe(400);
    // Los hitos no se pueden cambiar por la API.
    await rewardPatch(await req(adminId, "/api/admin/loyalty/rewards/2", { method: "PATCH", body: { firstMilestone: 1, step: 1 } }), { params: { id: "2" } });
    const burgerReward = (await listRewards()).find((r) => r.code === "burger")!;
    expect([burgerReward.firstMilestone, burgerReward.step]).toEqual([15, 15]);
  });

  it("la tarjeta pública muestra reglas y premios sin ids internos ni datos del empleado", async () => {
    const phone = "5493000400003";
    await stamps(phone, 15);
    await redeemGrant({ grantId: await grantId(phone, "papas", 5), userId: adminId, note: "nota interna" });
    const res = await publicGet(new NextRequest(`http://localhost/api/customer/${phone}/loyalty`), { params: { phone } });
    const data = await res.json();
    expect(data.account.stamps).toBe(15);
    expect(data.grants.map((g: any) => `${g.rewardCode}@${g.milestone}:${g.status}`).sort()).toEqual(["burger@15:disponible", "papas@5:canjeado"]);
    const dump = JSON.stringify(data);
    expect(dump).not.toMatch(/nota interna|Admin T|Encargado T|redeemedBy|"id"|productId|note/);
  });
});

describe("el informe de solo lectura sigue intacto", () => {
  it("el informe no genera premios ni escribe en las tablas nuevas", async () => {
    const { getLoyaltyReport } = await import("@/lib/admin/loyalty-report");
    const dump = async () =>
      JSON.stringify([
        (await getPool().query("select * from gestion_loyalty_grants order by id")).rows,
        (await getPool().query("select * from gestion_loyalty_rewards order by id")).rows,
        (await getPool().query("select * from gestion_loyalty_accounts order by phone")).rows,
      ]);
    const before = await dump();
    await getLoyaltyReport();
    expect(await dump()).toBe(before);
  });
});
