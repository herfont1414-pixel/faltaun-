import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { ensureSeeded, resetSeedCache } from "@/lib/admin/seed";
import { addItem, createCounterOrder, createProduct, getState, sendToKitchen } from "@/lib/admin/store";
import { getPrintableOrder } from "@/lib/admin/print";
import { POST as productsPost } from "@/app/api/admin/products/route";

let dbPath: string;
let mozoId: number;
let encargadoId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("new-product");
  const mk = async (name: string, role: string) =>
    Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true) returning id", [name, hashPin("4321"), role])).rows[0].id);
  mozoId = await mk("Mozo P", "mozo");
  encargadoId = await mk("Encargado P", "encargado");
});
afterAll(() => tearDownTestDb(dbPath));

const row = async (name: string) =>
  (await getPool().query("select p.*, c.name as category from gestion_products p join gestion_categories c on c.id = p.category_id where p.name = $1", [name])).rows[0];

describe("productos nuevos", () => {
  it("vienen cargadas la pizza y la media de champiñón (activas en Fudo, faltaban)", async () => {
    const state = await getState();
    expect(state.catalog["Pizzas"].find((p) => p.name === "Pizza Champiñon")).toMatchObject({ price: 15000, inStock: true });
    expect(state.catalog["Media Pizza 1/2"].find((p) => p.name === "1/2 Champiñon")).toMatchObject({ price: 8000, inStock: true });
  });

  it("si se pausa la de champiñón, no vuelve a aparecer sola", async () => {
    await getPool().query("update gestion_products set active = false where name = '1/2 Champiñon'");
    resetSeedCache();
    await ensureSeeded();
    expect(Boolean((await row("1/2 Champiñon")).active)).toBe(false);
    await getPool().query("update gestion_products set active = true where name = '1/2 Champiñon'");
  });

  it("crea un producto que se puede vender y sale en la comanda", async () => {
    const p = await createProduct({ name: "  Pizza   Rúcula y Crudo ", category: "Pizzas", price: 16000, stockQty: 5, showOnline: false }, encargadoId);
    expect(p.name).toBe("Pizza Rúcula y Crudo");
    expect(await row("Pizza Rúcula y Crudo")).toMatchObject({ category: "Pizzas", stock_qty: 5 });
    const r = await row("Pizza Rúcula y Crudo");
    expect(Boolean(r.active)).toBe(true);
    expect(Boolean(r.show_online)).toBe(false);
    expect(Boolean(r.created_in_panel)).toBe(true);

    const state = await getState();
    expect(state.catalog["Pizzas"].some((x) => x.id === p.id)).toBe(true);
    const order = await createCounterOrder();
    await addItem(order.id, p.id);
    await sendToKitchen(order.id);
    const printable = await getPrintableOrder(order.id);
    expect(printable.items).toEqual([expect.objectContaining({ name: "Pizza Rúcula y Crudo", qty: 1, area: "Cocina" })]);

    const audit = await getPool().query("select user_id from gestion_audit_log where action = 'product_create' and entity_id = $1", [String(p.id)]);
    expect(Number(audit.rows[0].user_id)).toBe(encargadoId);
  });

  it("valida nombre, precio, stock y que no se repita", async () => {
    await expect(createProduct({ name: " ", category: "Pizzas", price: 100 })).rejects.toThrow(/nombre/);
    await expect(createProduct({ name: "Algo", category: "Pizzas", price: -1 })).rejects.toThrow(/Precio/);
    await expect(createProduct({ name: "Algo", category: "Pizzas", price: 100, stockQty: -2 })).rejects.toThrow(/Stock/);
    await expect(createProduct({ name: "Algo", category: "No existe", price: 100 })).rejects.toThrow(/categoría/);
    await expect(createProduct({ name: "pizza champiñon", category: "Pizzas", price: 100 })).rejects.toThrow(/Ya existe "pizza champiñon" en Pizzas/);
    await expect(createProduct({ name: "Pizza Champiñon", category: "Entradas", price: 100 })).rejects.toThrow(/Ya existe/);
  });

  it("si ya existía pausado en la misma categoría, lo reactiva con los datos nuevos (no lo duplica)", async () => {
    await getPool().query("update gestion_products set active = false where name = 'Papas Fritas'");
    const before = await row("Papas Fritas");
    const p = await createProduct({ name: "Papas Fritas", category: before.category, price: 7900 });
    expect(p.id).toBe(Number(before.id));
    const after = await row("Papas Fritas");
    expect(Boolean(after.active)).toBe(true);
    expect(Number(after.price)).toBe(7900);
    expect((await getPool().query("select count(*) as n from gestion_products where name = 'Papas Fritas'")).rows[0].n).toBe(1);
  });

  it("una nueva carga del catálogo no pausa los productos creados en el panel", async () => {
    await getPool().query("delete from gestion_meta where key = 'catalog_hash'");
    resetSeedCache();
    await ensureSeeded();
    expect(Boolean((await row("Pizza Rúcula y Crudo")).active)).toBe(true);
    expect(Boolean((await row("Pizza Champiñon")).active)).toBe(true);
  });

  it("la carta del panel no muestra categorías vacías", async () => {
    const cat = await getPool().query<{ id: number }>("insert into gestion_categories (name, sort_order) values ('Vacía', 99) returning id");
    expect(cat.rows[0].id).toBeTruthy();
    const state = await getState();
    expect(Object.keys(state.catalog)).not.toContain("Vacía");
    for (const items of Object.values(state.catalog)) expect(items.length).toBeGreaterThan(0);
  });

  it("solo admin y encargado pueden crear (un mozo no)", async () => {
    const req = async (userId: number | null, body: unknown) =>
      new NextRequest("http://localhost/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json", ...(userId ? { cookie: `${SESSION_COOKIE}=${await createSession(userId)}` } : {}) },
        body: JSON.stringify(body),
      });
    const body = { name: "Flan Casero", category: "Entradas", price: 4000, stockQty: "" };
    expect((await productsPost(await req(null, body))).status).toBe(401);
    expect((await productsPost(await req(mozoId, body))).status).toBe(401);
    const res = await productsPost(await req(encargadoId, body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.product.name).toBe("Flan Casero");
    expect(data.products.some((p: { name: string; stockQty: number | null }) => p.name === "Flan Casero" && p.stockQty === null)).toBe(true);
    const dup = await productsPost(await req(encargadoId, body));
    expect(dup.status).toBe(400);
    expect((await dup.json()).error).toMatch(/Ya existe/);
  });
});
