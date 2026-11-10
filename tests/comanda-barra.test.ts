import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { ensureSeeded, resetSeedCache } from "@/lib/admin/seed";
import { addItem, openTable, sendToKitchen, updateProduct } from "@/lib/admin/store";
import { getPrintableOrder, getPrintableTicket } from "@/lib/admin/print";
import { GET as comandaGet } from "@/app/api/admin/print/comanda/[orderId]/route";
import { POST as directPost } from "@/app/api/admin/print-direct/route";
import { PATCH as areaPatch } from "@/app/api/admin/print-areas/[id]/route";

let dbPath: string;
let encargadoId: number;
let mozoId: number;
let drink: { id: number; name: string };
let food: { id: number; name: string };

const productByName = async (name: string) =>
  ({ id: Number((await getPool().query("select id from gestion_products where name = $1", [name])).rows[0].id), name });
const areaId = async (nombre: string) => Number((await getPool().query("select id from gestion_print_areas where nombre = $1", [nombre])).rows[0].id);

beforeAll(async () => {
  dbPath = await seedFreshDb("comanda-barra");
  const mk = async (name: string, role: string) =>
    Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true) returning id", [name, hashPin("2468"), role])).rows[0].id);
  encargadoId = await mk("Encargado B", "encargado");
  mozoId = await mk("Mozo B", "mozo");
  drink = await productByName("Agua Sin Gas 500ml");
  food = await productByName("Papas Fritas");
  for (const p of [drink, food]) await updateProduct(p.id, { active: true, inStock: true, stockQty: null });
});
afterAll(() => tearDownTestDb(dbPath));

const req = async (userId: number, url: string, init: { method: string; body?: unknown }) =>
  new NextRequest(`http://localhost${url}`, {
    method: init.method,
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${await createSession(userId)}` },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

describe("comanda de cocina sin bebidas ni barra", () => {
  it("Barra viene sin salir en la comanda, Cocina sí", async () => {
    const { rows } = await getPool().query("select nombre, en_comanda from gestion_print_areas order by nombre");
    expect(rows.map((r: any) => [r.nombre, Boolean(r.en_comanda)])).toEqual([
      ["Barra", false],
      ["Cocina", true],
    ]);
  });

  it("en una mesa con comida y bebida, la comanda lleva solo la comida; la cuenta lleva las dos", async () => {
    const order = await openTable(21);
    await addItem(order.id, food.id);
    await addItem(order.id, drink.id);
    await sendToKitchen(order.id);
    const comanda = await getPrintableOrder(order.id);
    expect(comanda.items.map((i) => i.name)).toEqual([food.name]);
    expect(comanda.areas).toEqual(["Cocina"]);
    const ticket = await getPrintableTicket(order.id);
    expect(ticket.items.map((i: { name: string }) => i.name).sort()).toEqual([drink.name, food.name].sort());
  });

  it("si solo se pidieron bebidas, no se imprime nada (ni reimprimiendo completa)", async () => {
    const order = await openTable(22);
    await addItem(order.id, drink.id);
    await sendToKitchen(order.id);
    expect((await getPrintableOrder(order.id)).items).toEqual([]);
    expect(await (await directPost(await req(mozoId, "/api/admin/print-direct", { method: "POST", body: { type: "comanda", orderId: order.id } }))).json()).toEqual({
      ok: false,
      reason: "nothing_new",
    });
    expect(await (await directPost(await req(mozoId, "/api/admin/print-direct", { method: "POST", body: { type: "comanda", orderId: order.id, all: true } }))).json()).toEqual({
      ok: false,
      reason: "nothing_new",
    });
    const html = await comandaGet(await req(mozoId, `/api/admin/print/comanda/${order.id}?all=1`, { method: "GET" }), { params: { orderId: order.id } });
    expect(html.status).toBe(204);
  });

  it("vale el área asignada al producto: comida en Barra no sale, bebida en Cocina sí", async () => {
    await getPool().query("update gestion_products set print_area_id = $2 where id = $1", [food.id, await areaId("Barra")]);
    await getPool().query("update gestion_products set print_area_id = $2 where id = $1", [drink.id, await areaId("Cocina")]);
    const order = await openTable(23);
    await addItem(order.id, food.id);
    await addItem(order.id, drink.id);
    await sendToKitchen(order.id);
    expect((await getPrintableOrder(order.id)).items.map((i) => i.name)).toEqual([drink.name]);
    await getPool().query("update gestion_products set print_area_id = null where id in ($1, $2)", [food.id, drink.id]);
  });

  it("desde Impresión se puede volver a incluir Barra (y un reinicio no lo pisa); un mozo no puede cambiarlo", async () => {
    const barra = await areaId("Barra");
    expect((await areaPatch(await req(mozoId, `/api/admin/print-areas/${barra}`, { method: "PATCH", body: { enComanda: true } }), { params: { id: String(barra) } })).status).toBe(401);
    const res = await areaPatch(await req(encargadoId, `/api/admin/print-areas/${barra}`, { method: "PATCH", body: { enComanda: true } }), {
      params: { id: String(barra) },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).areas.find((a: { nombre: string }) => a.nombre === "Barra").enComanda).toBe(true);

    resetSeedCache();
    await ensureSeeded();
    const order = await openTable(24);
    await addItem(order.id, drink.id);
    await sendToKitchen(order.id);
    expect((await getPrintableOrder(order.id)).items.map((i) => i.name)).toEqual([drink.name]);

    const bad = await areaPatch(await req(encargadoId, `/api/admin/print-areas/${barra}`, { method: "PATCH", body: {} }), { params: { id: String(barra) } });
    expect(bad.status).toBe(400);
  });
});
