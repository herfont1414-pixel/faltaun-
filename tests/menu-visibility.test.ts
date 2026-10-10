import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { getMenuItems } from "@/lib/menu";
import { isOnlineAvailable, hasStock } from "@/lib/menu-availability";
import { listAllProducts, updateProduct, getState, openTable, addItem, finalizeOrder } from "@/lib/admin/store";
import { createWebOrder } from "@/lib/admin/web-orders";
import { getSalesReport } from "@/lib/admin/reports";

let dbPath: string;
let categoryName: string;
// Productos de una categoría propia, para no depender del catálogo semilla.
const ids: Record<string, number> = {};

async function makeProduct(key: string, price = 1000) {
  const pool = getPool();
  const { rows } = await pool.query(
    `insert into gestion_products (category_id, name, price, active, in_stock)
     values ((select id from gestion_categories where name = $1), $2, $3, true, true) returning id`,
    [categoryName, `Test ${key}`, price]
  );
  ids[key] = rows[0].id;
}

const names = async () => (await getMenuItems()).map((i) => i.name);

beforeAll(async () => {
  dbPath = await seedFreshDb("menu-visibility");
  const pool = getPool();
  categoryName = "Categoría de prueba";
  await pool.query("insert into gestion_categories (name, sort_order) values ($1, 999)", [categoryName]);
  for (const k of ["disponible", "agotado", "oculto", "sinControl", "recupera"]) await makeProduct(k);
  await updateProduct(ids.disponible, { stockQty: 5 });
  await updateProduct(ids.agotado, { stockQty: 0 });
  await updateProduct(ids.oculto, { stockQty: 5, showOnline: false });
  // sinControl: stock_qty null, in_stock true (sin control de stock)
  await updateProduct(ids.recupera, { stockQty: 0 });
});

afterAll(() => tearDownTestDb(dbPath));

describe("reglas de disponibilidad (función pura)", () => {
  const base = { active: true, showOnline: true, inStock: true, stockQty: null as number | null };
  it("cubre los casos del modelo de stock", () => {
    expect(isOnlineAvailable({ ...base, stockQty: 3 })).toBe(true);
    expect(isOnlineAvailable({ ...base, stockQty: 0, inStock: false })).toBe(false);
    expect(isOnlineAvailable({ ...base, stockQty: 3, showOnline: false })).toBe(false);
    expect(isOnlineAvailable({ ...base })).toBe(true); // sin control de stock
    expect(isOnlineAvailable({ ...base, active: false })).toBe(false);
    expect(hasStock({ inStock: false, stockQty: null })).toBe(false); // marcado "sin stock" a mano
  });
});

describe("menú online público", () => {
  it("habilitado + stock controlado y disponible: aparece", async () => {
    expect(await names()).toContain("Test disponible");
  });
  it("habilitado + stock controlado y agotado: no aparece", async () => {
    expect(await names()).not.toContain("Test agotado");
  });
  it("deshabilitado a mano aunque tenga stock: no aparece", async () => {
    expect(await names()).not.toContain("Test oculto");
  });
  it("habilitado sin control de stock: aparece", async () => {
    expect(await names()).toContain("Test sinControl");
  });
  it("agotado que recupera stock: vuelve a aparecer", async () => {
    expect(await names()).not.toContain("Test recupera");
    await updateProduct(ids.recupera, { stockQty: 4 });
    expect(await names()).toContain("Test recupera");
  });
  it("producto marcado 'sin stock' a mano (sin control de cantidad): no aparece, y vuelve al reponerlo", async () => {
    await updateProduct(ids.sinControl, { inStock: false });
    expect(await names()).not.toContain("Test sinControl");
    await updateProduct(ids.sinControl, { inStock: true });
    expect(await names()).toContain("Test sinControl");
  });
  it("ningún producto del menú sale como 'sin stock'", async () => {
    expect((await getMenuItems()).every((i) => i.inStock)).toBe(true);
  });
  it("categoría sin productos disponibles: desaparece", async () => {
    const before = new Set((await getMenuItems()).map((i) => i.category));
    expect(before.has(categoryName)).toBe(true);
    for (const k of Object.keys(ids)) await updateProduct(ids[k], { showOnline: false });
    const after = new Set((await getMenuItems()).map((i) => i.category));
    expect(after.has(categoryName)).toBe(false);
    for (const k of Object.keys(ids)) await updateProduct(ids[k], { showOnline: k !== "oculto" });
  });
  it("si todo el menú queda oculto no cae al menú de ejemplo", async () => {
    const { rows } = await getPool().query("select id from gestion_products");
    const prev = await listAllProducts();
    for (const r of rows) await updateProduct(r.id, { showOnline: false });
    expect(await getMenuItems()).toEqual([]);
    for (const p of prev) await updateProduct(p.id, { showOnline: p.showOnline });
  });
});

describe("producto oculto: sigue existiendo en el sistema", () => {
  it("aparece en el administrador, en el POS y se puede vender en el mostrador", async () => {
    const all = await listAllProducts();
    const hidden = all.find((p) => p.id === ids.oculto)!;
    expect(hidden.showOnline).toBe(false);
    expect(hidden.active).toBe(true);

    const state = await getState();
    expect(Object.values(state.catalog).flat().some((p) => p.id === ids.oculto)).toBe(true);

    const order = await openTable(7, {});
    await addItem(order.id, ids.oculto);
    await finalizeOrder(order.id, [{ method: "efectivo", amount: 1000 }], null);
  });
  it("sus ventas siguen en los informes", async () => {
    const report = await getSalesReport("2000-01-01T00:00:00.000Z", "2100-01-01T00:00:00.000Z");
    expect(report.orderCount).toBeGreaterThanOrEqual(1);
    expect(report.totalSales).toBeGreaterThanOrEqual(1000);
  });
});

describe("el servidor rechaza lo que no se ofrece (petición directa)", () => {
  const order = (name: string) => ({
    customerName: "Ana",
    customerPhone: "5491100000001",
    items: [{ name, qty: 1 }],
    notes: null,
    customerAddress: null,
    deliveryZone: null,
    fulfillment: "retiro" as const,
  });
  it("agotado", async () => {
    await expect(createWebOrder(order("Test agotado"))).rejects.toThrow("ya no está disponible");
  });
  it("oculto a mano", async () => {
    await expect(createWebOrder(order("Test oculto"))).rejects.toThrow("ya no está disponible");
  });
  it("disponible y sin control de stock: se puede pedir", async () => {
    const a = await createWebOrder(order("Test disponible"));
    const b = await createWebOrder(order("Test sinControl"));
    expect(a.total).toBe(1000);
    expect(b.total).toBe(1000);
  });
});
