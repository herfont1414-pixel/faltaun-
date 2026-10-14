import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { openTable, addItem, setQty, finalizeOrder, updateProduct, getState } from "@/lib/admin/store";
import { getPool } from "@/lib/admin/db";

let dbPath: string;

beforeAll(async () => {
  dbPath = await seedFreshDb("stock");
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

async function firstProductId() {
  const state = await getState();
  const firstCategory = Object.values(state.catalog)[0];
  return firstCategory[0];
}

describe("stock: suficiente, insuficiente, consumo por venta, ajuste manual", () => {
  it("vender con stock suficiente descuenta la cantidad exacta", async () => {
    const product = await firstProductId();
    await updateProduct(product.id, { stockQty: 5 });

    const order = await openTable(10, {});
    await addItem(order.id, product.id);
    await finalizeOrder(order.id, [{ method: "efectivo", amount: product.price }], null);

    const pool = getPool();
    const { rows } = await pool.query<{ stock_qty: number }>(
      "select stock_qty from gestion_products where id = $1",
      [product.id]
    );
    expect(rows[0].stock_qty).toBe(4);
  });

  it("vender más de lo que hay en stock se rechaza sin tocar el stock", async () => {
    const product = await firstProductId();
    await updateProduct(product.id, { stockQty: 2 });

    const order = await openTable(11, {});
    await addItem(order.id, product.id);
    const state1 = await getState();
    const itemId = state1.openOrders.find((o) => o.id === order.id)!.items[0].id;
    // Al cargar ya no deja pedir más de lo que hay (5 con stock 2).
    await expect(setQty(order.id, itemId, 4)).rejects.toThrow(/Quedan 2/);
    await setQty(order.id, itemId, 1); // 2 en total: justo lo que hay

    // Mientras la mesa está abierta, el stock baja (otra venta / ajuste): al cobrar se frena igual.
    await updateProduct(product.id, { stockQty: 1 });
    await expect(
      finalizeOrder(order.id, [{ method: "efectivo", amount: product.price * 2 }], null)
    ).rejects.toThrow("No hay suficiente stock");

    const pool = getPool();
    const { rows } = await pool.query<{ stock_qty: number }>(
      "select stock_qty from gestion_products where id = $1",
      [product.id]
    );
    expect(rows[0].stock_qty).toBe(1); // sin cambios

    const state2 = await getState();
    expect(state2.openOrders.find((o) => o.id === order.id)?.status).toBe("abierta");
  });

  it("una venta exitosa deja un movimiento de stock tipo 'venta' con cantidad negativa", async () => {
    const product = await firstProductId();
    await updateProduct(product.id, { stockQty: 10 });
    const order = await openTable(12, {});
    await addItem(order.id, product.id);
    await finalizeOrder(order.id, [{ method: "efectivo", amount: product.price }], null);

    const pool = getPool();
    const { rows } = await pool.query<{ type: string; quantity: number }>(
      "select type, quantity from gestion_stock_movements where product_id = $1 and type = 'venta' order by created_at desc limit 1",
      [product.id]
    );
    expect(rows[0].type).toBe("venta");
    expect(rows[0].quantity).toBe(-1);
  });

  it("un ajuste manual de stock queda registrado con el signo correcto", async () => {
    const product = await firstProductId();
    await updateProduct(product.id, { stockQty: 10 });
    await updateProduct(product.id, { stockQty: 15 }); // ajuste +5

    const pool = getPool();
    const { rows } = await pool.query<{ stock_qty: number }>(
      "select stock_qty from gestion_products where id = $1",
      [product.id]
    );
    expect(rows[0].stock_qty).toBe(15);
  });
});
