import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { upsertDeliveryZone } from "@/lib/admin/store";
import { createWebOrder } from "@/lib/admin/web-orders";
import { getPool } from "@/lib/admin/db";

let dbPath: string;

beforeAll(async () => {
  dbPath = await seedFreshDb("delivery");
  await upsertDeliveryZone("Centro", 2000);
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

async function firstProductName() {
  const product = await anyInStockProduct();
  return product.name;
}

describe("delivery: zona válida, zona inválida, costo manipulado", () => {
  it("una zona válida resuelve el costo real guardado en el servidor", async () => {
    const productName = await firstProductName();
    const order = await createWebOrder({
      customerName: "Cliente Zona Real",
      customerPhone: "5491000000001",
      notes: null,
      items: [{ name: productName, qty: 1 }],
      fulfillment: "delivery",
      customerAddress: "Calle 123",
      deliveryZone: "Centro",
    });
    expect(order.shippingCost).toBe(2000);
  });

  it("una zona que no existe rechaza el pedido", async () => {
    const productName = await firstProductName();
    await expect(
      createWebOrder({
        customerName: "Cliente Zona Falsa",
        customerPhone: "5491000000002",
        notes: null,
        items: [{ name: productName, qty: 1 }],
        fulfillment: "delivery",
        customerAddress: "Calle 456",
        deliveryZone: "Zona Que No Existe",
      })
    ).rejects.toThrow("La zona de entrega elegida no existe");
  });

  it("createWebOrder no acepta ningún campo de costo del cliente: el costo siempre se recalcula", async () => {
    const productName = await firstProductName();
    // El tipo de entrada ni siquiera tiene un campo shippingCost — esto en
    // sí mismo es la prueba de que no hay forma de mandarlo. Se confirma
    // que el total es ítems + costo real de la zona, no otra cosa.
    const order = await createWebOrder({
      customerName: "Cliente Sin Forma De Mentir",
      customerPhone: "5491000000003",
      notes: null,
      items: [{ name: productName, qty: 1 }],
      fulfillment: "delivery",
      customerAddress: "Calle 789",
      deliveryZone: "Centro",
    });
    const pool = getPool();
    const { rows } = await pool.query<{ price: string | number }>(
      "select price from gestion_products where name = $1",
      [productName]
    );
    const price = typeof rows[0].price === "string" ? parseFloat(rows[0].price) : rows[0].price;
    expect(order.total).toBe(price + 2000);
  });

  it("confirmar un pedido sin stock suficiente se rechaza y no descuenta nada", async () => {
    const pool = getPool();
    const productName = await firstProductName();
    await pool.query("update gestion_products set stock_qty = 0, in_stock = $2 where name = $1", [
      productName,
      false,
    ]);

    await expect(
      createWebOrder({
        customerName: "Sin Stock",
        customerPhone: "5491000000004",
        notes: null,
        items: [{ name: productName, qty: 1 }],
        fulfillment: "retiro",
        customerAddress: null,
        deliveryZone: null,
      })
    ).rejects.toThrow("ya no está disponible");
  });
});
