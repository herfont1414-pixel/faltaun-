import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { addItem, createCounterOrder, finalizeOrder, setQty } from "@/lib/admin/store";

let dbPath: string;
let lomoId: number;
let papasId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("stock-limit");
  const pool = getPool();
  lomoId = Number((await pool.query("select id from gestion_products where name = 'Lomo Al Plato'")).rows[0].id);
  papasId = Number((await pool.query("select id from gestion_products where name = 'Papas Fritas'")).rows[0].id);
});
afterAll(() => tearDownTestDb(dbPath));

const stockOf = async (id: number) => (await getPool().query("select stock_qty, in_stock from gestion_products where id = $1", [id])).rows[0];

describe("stock controlado al cargar pedidos", () => {
  it("el catálogo trae Lomo al plato con stock 2", async () => {
    expect(Number((await stockOf(lomoId)).stock_qty)).toBe(2);
  });

  it("no deja cargar más de lo que queda (ni con el +), y el cobro de lo cargado funciona", async () => {
    const o = await createCounterOrder();
    await addItem(o.id, lomoId);
    await addItem(o.id, lomoId);
    await expect(addItem(o.id, lomoId)).rejects.toThrow(/Quedan 2 de Lomo Al Plato y este pedido ya tiene 2/);
    const { rows } = await getPool().query("select id from gestion_order_items where order_id = $1 and product_id = $2", [o.id, lomoId]);
    await expect(setQty(o.id, String(rows[0].id), 1)).rejects.toThrow(/Quedan 2/);
    // Bajar la cantidad siempre se puede.
    await setQty(o.id, String(rows[0].id), -1);
    await setQty(o.id, String(rows[0].id), 1);

    const price = Number((await getPool().query("select price from gestion_products where id = $1", [lomoId])).rows[0].price);
    await finalizeOrder(o.id, [{ method: "efectivo", amount: price * 2 } as never], null, null);
    const after = await stockOf(lomoId);
    expect(Number(after.stock_qty)).toBe(0);
    expect(Boolean(after.in_stock)).toBe(false);
    // Ya agotado: el aviso es "sin stock".
    const o2 = await createCounterOrder();
    await expect(addItem(o2.id, lomoId)).rejects.toThrow(/sin stock/);
  });

  it("los productos sin control de cantidad se cargan sin límite", async () => {
    const o = await createCounterOrder();
    for (let i = 0; i < 30; i++) await addItem(o.id, papasId);
    const { rows } = await getPool().query("select qty from gestion_order_items where order_id = $1", [o.id]);
    expect(Number(rows[0].qty)).toBe(30);
  });
});
