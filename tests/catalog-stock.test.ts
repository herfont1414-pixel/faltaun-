import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";

let dbPath: string;
beforeAll(async () => {
  dbPath = await seedFreshDb("catalog-stock");
});
afterAll(() => tearDownTestDb(dbPath));

const catalog = JSON.parse(readFileSync(path.join(process.cwd(), "data", "catalogo_productos.json"), "utf-8")) as Record<
  string,
  { name: string; price: number; inStock?: boolean; stock?: number }[]
>;

async function product(name: string) {
  const { rows } = await getPool().query(
    "select price, in_stock, stock_qty, active, show_online from gestion_products where name = $1",
    [name]
  );
  const r = rows[0];
  return {
    price: Number(r.price),
    inStock: Boolean(r.in_stock),
    stockQty: r.stock_qty === null ? null : Number(r.stock_qty),
    active: Boolean(r.active),
    showOnline: Boolean(r.show_online),
  };
}

describe("catálogo con stock de Fudo", () => {
  it("el archivo trae stock solo como cantidad positiva y razonable (1 a 499)", () => {
    const all = Object.values(catalog).flat();
    expect(all).toHaveLength(196);
    for (const p of all) {
      if (p.stock !== undefined) {
        expect(Number.isInteger(p.stock)).toBe(true);
        expect(p.stock).toBeGreaterThanOrEqual(1);
        expect(p.stock).toBeLessThanOrEqual(499);
        expect(p.inStock).not.toBe(false);
      }
    }
    expect(all.filter((p) => p.stock !== undefined)).toHaveLength(47);
    expect(all.filter((p) => p.inStock === false)).toHaveLength(41);
  });

  it("aplica la regla: controlado con su cantidad, sin stock, y disponible sin control", async () => {
    expect(await product("Lomo Al Plato")).toMatchObject({ stockQty: 2, inStock: true, active: true });
    expect(await product("Emp Carne Pic Cuchillo")).toMatchObject({ stockQty: 405, inStock: true });
    expect(await product("Sandwich Lomito")).toMatchObject({ stockQty: null, inStock: false });
    // Números de relleno de Fudo (742186) y negativos: disponibles sin control.
    expect(await product("Papas Fritas")).toMatchObject({ stockQty: null, inStock: true, price: 7500 });
    expect(await product("Agua Sin Gas 500ml")).toMatchObject({ stockQty: null, inStock: true });
    // Antes estaban sin stock y en Fudo tienen: vuelven a estar disponibles.
    expect(await product("Emp Osobuco")).toMatchObject({ stockQty: 152, inStock: true });
  });

  it("una nueva carga del catálogo vuelve precio y stock a la lista, sin tocar 'mostrar en el menú online'", async () => {
    const pool = getPool();
    await pool.query("update gestion_products set price = 1, stock_qty = 999, in_stock = false, show_online = false where name = 'Lomo Al Plato'");
    await pool.query("delete from gestion_meta where key = 'catalog_hash'");
    await ensureSeeded();
    expect(await product("Lomo Al Plato")).toMatchObject({ price: 12500, stockQty: 2, inStock: true, showOnline: false });
  });

  it("sin cambios en el archivo no se vuelve a aplicar (lo editado en el panel se respeta)", async () => {
    const pool = getPool();
    await pool.query("update gestion_products set price = 13000, stock_qty = 7 where name = 'Lomo Al Plato'");
    await ensureSeeded();
    expect(await product("Lomo Al Plato")).toMatchObject({ price: 13000, stockQty: 7 });
  });
});
