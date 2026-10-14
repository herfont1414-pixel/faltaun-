import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anyInStockProduct, seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { addItem, createCounterOrder, finalizeOrder } from "@/lib/admin/store";
import { getProductSales, loadFudoHistory } from "@/lib/admin/product-sales";

let dbPath: string;
beforeAll(async () => {
  dbPath = await seedFreshDb("product-sales");
});
afterAll(() => tearDownTestDb(dbPath));

const history = loadFudoHistory();
const sumHistory = (from: string, to: string, filter: (product: string) => boolean = () => true) =>
  history.rows
    .filter((r) => r[0] >= from && r[0] <= to && filter(r[3]))
    .reduce((acc, r) => ({ qty: acc.qty + Number(r[4]), revenue: acc.revenue + Number(r[5]) }), { qty: 0, revenue: 0 });

async function sell(closedAt?: string) {
  const product = await anyInStockProduct();
  const order = await createCounterOrder();
  await addItem(order.id, product.id);
  await finalizeOrder(order.id, [{ method: "efectivo", amount: product.price } as never], null, null);
  if (closedAt) await getPool().query("update gestion_orders set closed_at = $2 where id = $1", [order.id, closedAt]);
  return product;
}

describe("productos vendidos: historial de Fudo + MaderoSys", () => {
  it("el historial cubre del 1/8 al 13/10 y cuadra con el total del reporte de Fudo", () => {
    expect(history.from).toBe("2026-08-01");
    expect(history.to).toBe("2026-10-13");
    expect(sumHistory(history.from, history.to)).toEqual({ qty: 8040, revenue: 29963450 });
  });

  it("todo el historial: mismos totales, nombres y categorías del sistema", async () => {
    const r = await getProductSales("2026-08-01", "2026-10-13");
    expect(r.totalRevenue).toBe(29963450);
    expect(r.totalQty).toBe(8040);
    expect(r.systemRevenue).toBe(0);
    const top = r.rows[0];
    expect(top).toMatchObject({ name: "Emp Carne Pic Cuchillo", category: "Empanadas", qty: 1415, revenue: 2547000, sources: ["fudo"] });
    expect(top.share).toBeCloseTo(8.5, 1);
    const heineken = r.rows.find((x) => x.name === "Heineken Litro")!;
    expect(heineken.category).toBe("Bebidas · Cervezas");
    // El envío de Fudo ("DELIVERY PUEBLO", categoría "v") se muestra como Envíos.
    expect(r.rows.find((x) => x.name === "Delivery Pueblo")!.category).toBe("Envíos");
    // Un producto que ya no está en el sistema se muestra igual, con nombre prolijo.
    expect(r.rows.some((x) => x.name === "Emp Arabe" && x.category === "Empanadas")).toBe(true);
  });

  it("un rango parcial suma solo esos días", async () => {
    const r = await getProductSales("2026-09-01", "2026-09-30");
    const expected = sumHistory("2026-09-01", "2026-09-30");
    expect(r.totalRevenue).toBeCloseTo(expected.revenue, 2);
    expect(r.totalQty).toBe(expected.qty);
  });

  it("no hay doble conteo: un cobro del sistema fechado dentro del historial no se suma; uno posterior sí", async () => {
    await sell("2026-10-10T23:00:00.000Z"); // pedido "de prueba" en un día que ya cubre Fudo
    const product = await sell(); // hoy (después del historial)
    const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

    const inside = await getProductSales("2026-10-10", "2026-10-10");
    expect(inside.systemRevenue).toBe(0);
    expect(inside.totalRevenue).toBeCloseTo(sumHistory("2026-10-10", "2026-10-10").revenue, 2);

    const span = await getProductSales("2026-10-13", today);
    expect(span.systemRevenue).toBe(product.price);
    expect(span.fudoRevenue).toBeCloseTo(sumHistory("2026-10-13", "2026-10-13").revenue, 2);
    const row = span.rows.find((x) => x.name === product.name)!;
    expect(row.sources).toContain("sistema");
  });

  it("valida las fechas y acepta el rango al revés", async () => {
    await expect(getProductSales("ayer", "hoy")).rejects.toThrow(/Fechas inválidas/);
    const r = await getProductSales("2026-08-31", "2026-08-01");
    expect(r.from).toBe("2026-08-01");
    expect(r.to).toBe("2026-08-31");
  });
});
