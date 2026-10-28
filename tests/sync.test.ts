import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createSqliteDb } from "@/lib/admin/sqlite-db";
import { getPool } from "@/lib/admin/db";
import type { Db } from "@/lib/admin/db";
import { ensureSeeded, resetSeedCache } from "@/lib/admin/seed";
import { resetReadCache } from "@/lib/admin/read-cache";
import { applyInbox, handleSync, isPcOnline, noteHeartbeat, resetHeartbeatThrottle } from "@/lib/admin/sync";
import type { SyncRequest, SyncResponse } from "@/lib/admin/sync";
import { syncOnce } from "@/lib/admin/sync-worker";
import { createWebOrder, listWebOrdersByPhone, respondWebOrder, ensurePosOrderForWebOrder } from "@/lib/admin/web-orders";
import { createReservation, listReservations } from "@/lib/admin/reservations";
import { addItem, finalizeOrder, updateProduct } from "@/lib/admin/store";
import { addStamp, getLoyalty } from "@/lib/admin/loyalty";
import { setMenuSpecial } from "@/lib/admin/menu-special";
import { getMenuHighlights, getMenuItems } from "@/lib/menu";
import { POST as syncPost } from "@/app/api/sync/route";
import { GET as businessGet } from "@/app/api/business-config/route";
import { middleware } from "@/middleware";

const g = globalThis as unknown as { __adminDb?: Db };
const files: string[] = [];
let pc: Db;
let cloud: Db;
let rawPc: Db;
let rawCloud: Db;

async function makeDb(name: string, role: "pc" | "nube") {
  const file = path.join(os.tmpdir(), `maderosys-test-sync-${name}-${crypto.randomUUID()}.db`);
  files.push(file);
  delete process.env.DATABASE_URL;
  process.env.SQLITE_PATH = file;
  process.env.MADERO_ROL = role === "nube" ? "nube" : "";
  const raw = createSqliteDb();
  g.__adminDb = raw;
  resetSeedCache();
  resetReadCache();
  await ensureSeeded();
  return { raw, db: getPool() };
}

// "Ser" la PC o la nube: cambia la base global y el rol (lo que usan las funciones públicas del sistema).
async function onPc<T>(fn: () => Promise<T>): Promise<T> {
  g.__adminDb = rawPc;
  process.env.MADERO_ROL = "";
  resetReadCache();
  return fn();
}
async function onCloud<T>(fn: () => Promise<T>): Promise<T> {
  g.__adminDb = rawCloud;
  process.env.MADERO_ROL = "nube";
  resetReadCache();
  return fn();
}

// Lleva el pedido a la nube como lo haría HTTP (todo pasa por JSON).
const send = (req: SyncRequest): Promise<SyncResponse> =>
  onCloud(() => handleSync(cloud, JSON.parse(JSON.stringify(req)))).then((r) => JSON.parse(JSON.stringify(r)));
const sync = () => syncOnce(pc, send, { popularNames: [] });

const count = async (db: Db, sql: string) => Number((await db.query(sql)).rows[0].n);

beforeAll(async () => {
  const a = await makeDb("pc", "pc");
  rawPc = a.raw;
  pc = a.db;
  const b = await makeDb("nube", "nube");
  rawCloud = b.raw;
  cloud = b.db;
  process.env.SYNC_TOKEN = "clave-de-prueba-1234567890";
});
afterAll(() => {
  process.env.MADERO_ROL = "";
  for (const f of files) for (const suffix of ["", "-wal", "-shm"]) rmSync(f + suffix, { force: true });
});

describe("conexión PC ↔ nube: el menú y los datos públicos", () => {
  it("la primera vez publica todo; la segunda no manda nada (nada cambió)", async () => {
    const first = await sync();
    expect(first.sentTables).toEqual(expect.arrayContaining(["gestion_categories", "gestion_products", "gestion_delivery_zones", "gestion_business_config", "gestion_loyalty_rewards", "meta"]));
    expect(await count(cloud, "select count(*) as n from gestion_products")).toBe(await count(pc, "select count(*) as n from gestion_products"));
    expect(await count(cloud, "select count(*) as n from gestion_categories")).toBe(8);
    expect(await count(cloud, "select count(*) as n from gestion_loyalty_rewards")).toBeGreaterThan(0);
    const second = await sync();
    expect(second.sentTables).toEqual([]);
    expect(second.trackingSent).toBe(0);
  });

  it("la nube no cargó el menú por su cuenta (no hay mesas, usuarios ni premios propios)", async () => {
    expect(await count(cloud, "select count(*) as n from gestion_users")).toBe(0);
    expect(await count(cloud, "select count(*) as n from gestion_zones")).toBe(0);
  });

  it("un cambio de precio o stock en la PC llega a la nube, y solo viaja lo que cambió", async () => {
    const lomo = (await pc.query("select id, price from gestion_products where name = 'Papas Fritas'")).rows[0];
    await onPc(() => updateProduct(Number(lomo.id), { price: 9900, stockQty: 7 }));
    const out = await sync();
    expect(out.sentTables.sort()).toEqual(["gestion_categories", "gestion_products"]);
    const row = (await cloud.query("select price, stock_qty from gestion_products where name = 'Papas Fritas'")).rows[0];
    expect(Number(row.price)).toBe(9900);
    expect(Number(row.stock_qty)).toBe(7);
    // El menú público de la nube muestra el precio nuevo.
    const items = await onCloud(() => getMenuItems());
    expect(items.find((i) => i.name === "Papas Fritas")?.price).toBe(9900);
  });

  it("un producto que se sacó o se ocultó en la PC deja de verse en la nube", async () => {
    const p = (await pc.query("select id from gestion_products where name = 'Papas Fritas'")).rows[0];
    await onPc(() => updateProduct(Number(p.id), { showOnline: false }));
    await sync();
    const items = await onCloud(() => getMenuItems());
    expect(items.some((i) => i.name === "Papas Fritas")).toBe(false);
    await onPc(() => updateProduct(Number(p.id), { showOnline: true }));
    await sync();
  });

  it("las tarjetas de fidelidad (y el premio) se ven en la nube", async () => {
    await onPc(async () => {
      for (let i = 0; i < 5; i++) await addStamp("3755412345", `p-${i}`, { orderTotal: 5000, name: "Lu", now: new Date(Date.UTC(2031, 0, 1 + i, 15)) });
    });
    await sync();
    const loyalty = await onCloud(() => getLoyalty("3755412345"));
    expect(loyalty.stamps).toBe(5);
    expect(loyalty.name).toBe("Lu");
    expect(await count(cloud, "select count(*) as n from gestion_loyalty_grants where phone = '3755412345'")).toBeGreaterThan(0);
  });

  it("el especial del día y el ranking de más pedidos viajan en 'meta'", async () => {
    const prod = (await pc.query("select id, name from gestion_products where active = true and in_stock = true and show_online = true limit 1")).rows[0];
    await onPc(() => setMenuSpecial({ active: true, productId: Number(prod.id), text: "Hoy con papas gratis" }));
    const names = (await pc.query("select name from gestion_products where active = true and in_stock = true and show_online = true limit 5")).rows.map((r: any) => r.name as string);
    await syncOnce(pc, send, { popularNames: names });
    const items = await onCloud(() => getMenuItems());
    const highlights = await onCloud(() => getMenuHighlights(items));
    expect(highlights?.special).toMatchObject({ id: String(prod.id), text: "Hoy con papas gratis" });
    expect(highlights?.popularIds.length).toBeGreaterThanOrEqual(3);
  });
});

describe("conexión PC ↔ nube: pedidos web y reservas", () => {
  const order = (name = "Sofi", phone = "3755419999") => ({
    customerName: name,
    customerPhone: phone,
    notes: null,
    items: [{ name: "Emp Carne Pic Cuchillo", qty: 2 }],
    fulfillment: "retiro" as const,
    customerAddress: null,
    deliveryZone: null,
    paymentMethod: "efectivo" as const,
  });
  let webId: string;

  it("con la PC conectada se puede pedir; el pedido queda en la bandeja de la nube", async () => {
    await sync(); // la sincronización le avisa a la nube que la PC está conectada
    resetHeartbeatThrottle();
    const created = await onCloud(() => createWebOrder(order()));
    webId = created.id;
    expect(created.status).toBe("pendiente");
    expect(await count(cloud, "select count(*) as n from gestion_sync_inbox")).toBe(1);
  });

  it("la PC lo baja con el mismo id, y la nube lo da por recibido en la vuelta siguiente", async () => {
    const out = await sync();
    expect(out.received).toEqual({ web: 1, reserva: 0 });
    const local = (await pc.query("select id, status, customer_name, total from gestion_web_orders where id = $1", [webId])).rows[0];
    expect(local).toMatchObject({ id: webId, status: "pendiente", customer_name: "Sofi" });
    expect(await count(cloud, "select count(*) as n from gestion_sync_inbox")).toBe(1); // todavía sin confirmar
    const next = await sync();
    expect(next.received).toEqual({ web: 0, reserva: 0 });
    expect(await count(cloud, "select count(*) as n from gestion_sync_inbox")).toBe(0);
    expect(await count(pc, "select count(*) as n from gestion_web_orders")).toBe(1);
  });

  it("el local acepta: el cliente lo ve en 'Mis pedidos' (preparando) y después entregado al cobrar", async () => {
    await onPc(() => respondWebOrder(webId, "confirmado", 30));
    await sync();
    let mine = await onCloud(() => listWebOrdersByPhone("3755419999"));
    expect(mine[0]).toMatchObject({ id: webId, status: "confirmado", etaMinutes: 30, progress: "preparando" });

    const posOrderId = await onPc(() => ensurePosOrderForWebOrder(webId));
    await onPc(async () => {
      const total = Number((await pc.query("select total from gestion_web_orders where id = $1", [webId])).rows[0].total);
      await finalizeOrder(posOrderId, [{ method: "efectivo", amount: total } as never], null, null);
    });
    await sync();
    mine = await onCloud(() => listWebOrdersByPhone("3755419999"));
    expect(mine[0].progress).toBe("entregado");
  });

  it("si el local rechaza, el cliente ve 'rechazado'", async () => {
    const created = await onCloud(() => createWebOrder(order("Rechazada", "3755410000")));
    await sync();
    await sync();
    await onPc(() => respondWebOrder(created.id, "rechazado", null));
    await sync();
    const mine = await onCloud(() => listWebOrdersByPhone("3755410000"));
    expect(mine[0].progress).toBe("rechazado");
  });

  it("repetir la entrega (se perdió la confirmación) no duplica el pedido ni le pisa el estado", async () => {
    const created = await onCloud(() => createWebOrder(order("Doble", "3755411100")));
    const resp = await send({ v: 1, ack: { web: [], reserva: [] }, publish: {}, tracking: [] });
    expect(resp.inbox.web.map((w) => String(w.id))).toContain(created.id);
    await applyInbox(pc, resp.inbox);
    await onPc(() => respondWebOrder(created.id, "confirmado", 15));
    await applyInbox(pc, resp.inbox); // la nube lo reenvió
    expect(await count(pc, `select count(*) as n from gestion_web_orders where id = '${created.id}'`)).toBe(1);
    expect((await pc.query("select status from gestion_web_orders where id = $1", [created.id])).rows[0].status).toBe("confirmado");
  });

  it("sin conexión a la nube no se pierde nada: el siguiente intento vuelve a mandar todo", async () => {
    const p = (await pc.query("select id from gestion_products where name = 'Papas Fritas'")).rows[0];
    await onPc(() => updateProduct(Number(p.id), { price: 12345 }));
    await expect(syncOnce(pc, async () => Promise.reject(new Error("sin internet")), { popularNames: [] })).rejects.toThrow("sin internet");
    expect((await cloud.query("select price from gestion_products where name = 'Papas Fritas'")).rows[0].price).not.toBe(12345);
    const ok = await sync();
    expect(ok.sentTables).toContain("gestion_products");
    expect(Number((await cloud.query("select price from gestion_products where name = 'Papas Fritas'")).rows[0].price)).toBe(12345);
  });

  it("con la PC desconectada no se puede pedir comida, pero sí reservar; la reserva llega cuando la PC vuelve", async () => {
    // La PC "habló" hace 10 minutos.
    await cloud.query("update gestion_meta set value = $1 where key = 'pc_last_seen'", [new Date(Date.now() - 10 * 60_000).toISOString()]);
    resetReadCache();
    await expect(onCloud(() => createWebOrder(order("Tarde", "3755412222")))).rejects.toThrow(/no está recibiendo pedidos/);
    expect((await onCloud(() => businessGet().then((r) => r.json()))).config.ordersOpen).toBe(false);

    const reserva = await onCloud(() => createReservation({ customerName: "Familia Gómez", customerPhone: "3755413333", partySize: 4, date: "2031-05-20", time: "21:00", notes: "cumple" }));
    expect(await count(cloud, "select count(*) as n from gestion_sync_inbox where kind = 'reserva'")).toBe(1);
    const out = await sync();
    expect(out.received.reserva).toBe(1);
    const mine = (await onPc(() => listReservations("pendiente"))).find((r) => r.id === reserva.id);
    expect(mine).toMatchObject({ customerName: "Familia Gómez", partySize: 4, time: "21:00", source: "web" });
    // La PC volvió a hablar (en la realidad la próxima vuelta, a los 30 s): el local figura abierto.
    resetHeartbeatThrottle();
    await sync();
    expect(await onCloud(() => isPcOnline(cloud))).toBe(true);
    expect((await onCloud(() => businessGet().then((r) => r.json()))).config.ordersOpen).toBe(true);
  });

  it("fuera de la nube (la PC o una instalación completa) siempre está abierto", async () => {
    expect(await onPc(() => isPcOnline(pc))).toBe(true);
    resetHeartbeatThrottle();
    await noteHeartbeat(cloud, Date.now(), true);
  });
});

describe("ruta /api/sync (la nube)", () => {
  const call = (token: string | null, body: unknown = { v: 1, ack: { web: [], reserva: [] }, publish: {}, tracking: [] }, ip = "9.9.9.9") =>
    onCloud(() =>
      syncPost(
        new NextRequest("http://localhost/api/sync", {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(body),
        })
      )
    );

  it("con la clave correcta responde la bandeja; sin clave o con otra, no", async () => {
    const ok = await call("clave-de-prueba-1234567890");
    expect(ok.status).toBe(200);
    const data = await ok.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.inbox.web) && Array.isArray(data.inbox.reserva)).toBe(true);
    expect((await call(null)).status).toBe(401);
    expect((await call("otra-clave-cualquiera-123")).status).toBe(401);
    expect((await call("clave-de-prueba-1234567890", { v: 2 })).status).toBe(400);
  });

  it("frena a quien prueba claves, sin molestar a la PC", async () => {
    for (let i = 0; i < 20; i++) await call(`mala-${i}-xxxxxxxxxxxxxxxx`, undefined, "6.6.6.6");
    expect((await call("mala-final-xxxxxxxxxxxxxxxx", undefined, "6.6.6.6")).status).toBe(429);
    expect((await call("clave-de-prueba-1234567890", undefined, "1.1.1.1")).status).toBe(200);
  });

  it("no existe fuera de la nube (la PC no acepta datos de afuera)", async () => {
    g.__adminDb = rawPc;
    process.env.MADERO_ROL = "";
    const res = await syncPost(new NextRequest("http://localhost/api/sync", { method: "POST", headers: { authorization: "Bearer clave-de-prueba-1234567890" }, body: "{}" }));
    expect(res.status).toBe(404);
  });
});

describe("la nube no tiene panel", () => {
  it("/admin y /api/admin no responden en la nube; en la PC todo sigue igual", () => {
    process.env.MADERO_ROL = "nube";
    const page = middleware(new NextRequest("http://localhost/admin"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost/");
    expect(middleware(new NextRequest("http://localhost/api/admin/state")).status).toBe(404);
    process.env.MADERO_ROL = "";
    expect(middleware(new NextRequest("http://localhost/api/admin/state")).status).toBe(401);
  });
});

describe("la nube sin menú todavía", () => {
  it("no muestra el menú de ejemplo: queda vacío hasta que la PC lo mande", async () => {
    const empty = await makeDb("vacia", "nube");
    rawCloud = empty.raw;
    expect(await onCloud(() => getMenuItems())).toEqual([]);
    // En la PC / instalación completa, sin productos cargados, sigue el menú de ejemplo.
    const full = await makeDb("completa", "pc");
    await full.db.query("delete from gestion_products");
    await full.db.query("delete from gestion_categories");
    resetReadCache();
    rawPc = full.raw;
    expect((await onPc(() => getMenuItems())).length).toBeGreaterThan(0);
  });
});
