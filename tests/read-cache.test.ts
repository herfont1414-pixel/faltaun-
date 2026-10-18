import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { anyInStockProduct, seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, destroySession, hashPin, requireUser, SESSION_COOKIE } from "@/lib/admin/auth";
import { addItem, createCounterOrder, getState, updateProduct } from "@/lib/admin/store";
import { cached, invalidateReads, noteQuery, resetReadCache } from "@/lib/admin/read-cache";
import { listWebOrders } from "@/lib/admin/web-orders";
import { getKitchenTickets } from "@/lib/admin/kitchen";
import { GET as stateGet } from "@/app/api/admin/state/route";

let dbPath: string;
let userId: number;
let product: { id: number; price: number };
let count = 0;

beforeAll(async () => {
  dbPath = await seedFreshDb("read-cache");
  product = await anyInStockProduct();
  userId = Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ('Caja', $1, 'admin', true) returning id", [hashPin("1212")])).rows[0].id);
  // Cuenta las consultas que llegan a la base (por debajo del seguimiento de escrituras).
  const raw: any = (globalThis as any).__adminDb;
  const orig = raw.query.bind(raw);
  raw.query = (...a: unknown[]) => {
    count++;
    return orig(...a);
  };
});
afterAll(() => tearDownTestDb(dbPath));

const queriesFor = async (fn: () => Promise<unknown>) => {
  count = 0;
  await fn();
  return count;
};

describe("caché de lecturas (menos consultas a la base)", () => {
  it("el estado del panel se consulta una vez y se reparte entre pantallas", async () => {
    resetReadCache();
    const first = await queriesFor(() => getState());
    expect(first).toBeGreaterThan(0);
    // Tres pantallas más preguntando al mismo tiempo: no toca la base.
    expect(await queriesFor(() => Promise.all([getState(), getState(), getState()]))).toBe(0);
  });

  it("después de una escritura el estado se vuelve a leer (nunca se muestra algo viejo)", async () => {
    const order = await createCounterOrder();
    expect((await getState()).openOrders.some((o) => o.id === order.id && o.items.length === 0)).toBe(true);
    await addItem(order.id, product.id);
    const fresh = (await getState()).openOrders.find((o) => o.id === order.id)!;
    expect(fresh.items).toHaveLength(1);
    // Escritura directa por cualquier camino también lo descarta.
    await getPool().query("update gestion_order_items set qty = 5 where order_id = $1", [order.id]);
    expect((await getState()).openOrders.find((o) => o.id === order.id)!.items[0].qty).toBe(5);
  });

  it("el menú se guarda más tiempo, pero cambiar un producto lo actualiza al instante", async () => {
    const before = (await getState()).catalog;
    const item = Object.values(before).flat().find((p) => p.id === product.id)!;
    expect(await queriesFor(() => getState())).toBeLessThanOrEqual(0);
    await updateProduct(product.id, { price: item.price + 100 });
    const after = Object.values((await getState()).catalog).flat().find((p) => p.id === product.id)!;
    expect(after.price).toBe(item.price + 100);
  });

  it("la sesión se recuerda unos segundos y se descarta al cerrarla", async () => {
    const token = await createSession(userId);
    const req = () => new NextRequest("http://localhost/x", { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    expect((await requireUser(req()))?.id).toBe(userId);
    expect(await queriesFor(() => requireUser(req()))).toBe(0);
    await destroySession(token);
    expect(await requireUser(req())).toBeNull();
  });

  it("un usuario desactivado pierde la sesión enseguida", async () => {
    const token = await createSession(userId);
    const req = () => new NextRequest("http://localhost/x", { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    expect(await requireUser(req())).not.toBeNull();
    await getPool().query("update gestion_users set active = false where id = $1", [userId]);
    expect(await requireUser(req())).toBeNull();
    await getPool().query("update gestion_users set active = true where id = $1", [userId]);
  });

  it("cocina y pedidos web también se comparten, y las escrituras ajenas (sesiones, auditoría) no los descartan", async () => {
    await getKitchenTickets();
    await listWebOrders("pendiente");
    expect(await queriesFor(() => Promise.all([getKitchenTickets(), listWebOrders("pendiente")]))).toBe(0);
    await getPool().query("insert into gestion_audit_log (user_id, action) values ($1, 'x')", [userId]);
    await getPool().query("insert into gestion_rate_limits (bucket, subject, created_ms) values ('t', 'k', 1)");
    expect(await queriesFor(() => Promise.all([getKitchenTickets(), listWebOrders("pendiente")]))).toBe(0);
    // Una escritura en pedidos sí los descarta.
    await getPool().query("update gestion_orders set notes = notes where false");
    expect(await queriesFor(() => getKitchenTickets())).toBeGreaterThan(0);
  });

  it("una lectura que empezó antes de una escritura no se guarda (no queda un dato viejo)", async () => {
    resetReadCache();
    let release!: () => void;
    const slow = cached("k", 60_000, ["gestion_orders"], () => new Promise<string>((r) => (release = () => r("viejo"))));
    noteQuery("update gestion_orders set status = 'x'");
    release();
    expect(await slow).toBe("viejo"); // quien la pidió la recibe…
    expect(await cached("k", 60_000, ["gestion_orders"], async () => "nuevo")).toBe("nuevo"); // …pero no se guardó
  });

  it("vence por tiempo y se puede descartar por tabla o completa", async () => {
    resetReadCache();
    let n = 0;
    const load = async () => ++n;
    expect(await cached("t", 20, ["gestion_a"], load)).toBe(1);
    expect(await cached("t", 20, ["gestion_a"], load)).toBe(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(await cached("t", 20, ["gestion_a"], load)).toBe(2);
    invalidateReads(["gestion_b"]);
    expect(await cached("t", 60_000, ["gestion_a"], load)).toBe(2);
    invalidateReads(["gestion_a"]);
    expect(await cached("t", 60_000, ["gestion_a"], load)).toBe(3);
    noteQuery("COMMIT");
    expect(await cached("t", 60_000, ["gestion_a"], load)).toBe(4);
    noteQuery("select * from gestion_a"); // las lecturas no descartan nada
    expect(await cached("t", 60_000, ["gestion_a"], load)).toBe(4);
  });

  it("la ruta del estado usa la caché y sigue pidiendo sesión", async () => {
    const token = await createSession(userId);
    const call = (cookie?: string) => stateGet(new NextRequest("http://localhost/api/admin/state", { headers: cookie ? { cookie } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call(`${SESSION_COOKIE}=${token}`)).status).toBe(200);
    expect(await queriesFor(async () => (await call(`${SESSION_COOKIE}=${token}`)).json())).toBe(0);
  });
});
