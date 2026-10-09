import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { upsertDeliveryZone, getState, finalizeOrder, setDeliveryStatus } from "@/lib/admin/store";
import { createWebOrder, respondWebOrder, ensurePosOrderForWebOrder, listWebOrders } from "@/lib/admin/web-orders";
import { getKitchenTickets } from "@/lib/admin/kitchen";
import { getPool } from "@/lib/admin/db";

let dbPath: string;
let productName: string;
let productId: number;
let price: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("web-orders");
  await upsertDeliveryZone("Centro", 2000);
  const product = await anyInStockProduct();
  productName = product.name;
  productId = product.id;
  price = product.price;
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

async function setStock(qty: number | null) {
  await getPool().query("update gestion_products set stock_qty = $2, in_stock = true where id = $1", [productId, qty]);
}
async function stock() {
  const { rows } = await getPool().query("select stock_qty from gestion_products where id = $1", [productId]);
  return rows[0].stock_qty as number | null;
}

describe("pedidos web aceptados se vuelven pedidos reales", () => {
  it("al aceptar un delivery se crea el pedido real, con envío, en 'preparando' y vinculado", async () => {
    const web = await createWebOrder({
      customerName: "Ana",
      customerPhone: "5491100000001",
      notes: "sin cebolla",
      items: [{ name: productName, qty: 2 }],
      fulfillment: "delivery",
      customerAddress: "Calle 1",
      deliveryZone: "Centro",
    });
    const { orderId } = await respondWebOrder(web.id, "confirmado", 30);
    expect(orderId).toBeTruthy();

    const state = await getState();
    const order = state.openOrders.find((o) => o.id === orderId)!;
    expect(order.isDelivery).toBe(true);
    expect(order.deliveryStatus).toBe("preparando");
    expect(order.customerName).toBe("Ana");
    expect(order.shippingCost).toBe(2000);
    expect(order.notes).toContain("sin cebolla");
    expect(order.items[0]).toMatchObject({ name: productName, qty: 2 });
    expect(order.total).toBe(price * 2 + 2000);

    const listed = (await listWebOrders()).find((o) => o.id === web.id)!;
    expect(listed.orderId).toBe(orderId);
    expect(listed.orderStatus).toBe("abierta");

    // puede avanzar de estado y cobrarse como cualquier delivery
    await setDeliveryStatus(orderId!, "en_camino");
    const result = await finalizeOrder(orderId!, [{ method: "efectivo", amount: order.total }], null);
    expect(result.total).toBe(price * 2 + 2000);
    expect((await listWebOrders()).find((o) => o.id === web.id)!.orderStatus).toBe("cerrada");
  });

  it("aceptar dos veces no duplica el pedido real (idempotente)", async () => {
    const web = await createWebOrder({
      customerName: "Beto",
      customerPhone: "5491100000002",
      notes: null,
      items: [{ name: productName, qty: 1 }],
      fulfillment: "retiro",
      customerAddress: null,
      deliveryZone: null,
    });
    const first = await respondWebOrder(web.id, "confirmado", 15);
    const second = await respondWebOrder(web.id, "confirmado", 15);
    expect(second.orderId).toBe(first.orderId);
    const { rows } = await getPool().query("select count(*) as n from gestion_orders where customer_phone = $1", [
      "5491100000002",
    ]);
    expect(Number(rows[0].n)).toBe(1);
    const order = (await getState()).openOrders.find((o) => o.id === first.orderId)!;
    expect(order.isDelivery).toBe(false);
    expect(order.total).toBe(price);
  });

  it("el stock se descuenta una sola vez, al cobrar (no al aceptar)", async () => {
    await setStock(10);
    const web = await createWebOrder({
      customerName: "Carla",
      customerPhone: "5491100000003",
      notes: null,
      items: [{ name: productName, qty: 3 }],
      fulfillment: "retiro",
      customerAddress: null,
      deliveryZone: null,
    });
    const { orderId } = await respondWebOrder(web.id, "confirmado", 15);
    expect(await stock()).toBe(10);
    await finalizeOrder(orderId!, [{ method: "transferencia", amount: price * 3 }], null);
    expect(await stock()).toBe(7);
    await expect(
      finalizeOrder(orderId!, [{ method: "transferencia", amount: price * 3 }], null)
    ).rejects.toThrow("ya fue cerrado");
    expect(await stock()).toBe(7);
    await setStock(null);
  });

  it("no se puede aceptar si no alcanza el stock", async () => {
    await setStock(5);
    const web = await createWebOrder({
      customerName: "Dani",
      customerPhone: "5491100000004",
      notes: null,
      items: [{ name: productName, qty: 4 }],
      fulfillment: "retiro",
      customerAddress: null,
      deliveryZone: null,
    });
    await setStock(2);
    await expect(respondWebOrder(web.id, "confirmado", 15)).rejects.toThrow("No hay suficiente stock");
    const { rows } = await getPool().query("select status, order_id from gestion_web_orders where id = $1", [web.id]);
    expect(rows[0].status).toBe("pendiente");
    expect(rows[0].order_id).toBeNull();
    await setStock(null);
  });

  it("rechazar no crea ningún pedido real", async () => {
    const web = await createWebOrder({
      customerName: "Eli",
      customerPhone: "5491100000005",
      notes: null,
      items: [{ name: productName, qty: 1 }],
      fulfillment: "retiro",
      customerAddress: null,
      deliveryZone: null,
    });
    const r = await respondWebOrder(web.id, "rechazado", null);
    expect(r.orderId).toBeNull();
    const { rows } = await getPool().query("select count(*) as n from gestion_orders where customer_phone = $1", [
      "5491100000005",
    ]);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("en cocina aparece una sola vez (el pedido real), no también el pedido web", async () => {
    const web = await createWebOrder({
      customerName: "Fede",
      customerPhone: "5491100000006",
      notes: null,
      items: [{ name: productName, qty: 1 }],
      fulfillment: "delivery",
      customerAddress: "Calle 6",
      deliveryZone: "Centro",
    });
    const { orderId } = await respondWebOrder(web.id, "confirmado", 20);
    const tickets = (await getKitchenTickets()).filter((t) => t.customerName === "Fede");
    expect(tickets).toHaveLength(1);
    expect(tickets[0].id).toBe(orderId);
    expect(tickets[0].items[0]).toMatchObject({ name: productName, qty: 1 });
  });

  it("un pedido aceptado antes del vínculo se abre igual y su stock no se descuenta dos veces", async () => {
    await setStock(10);
    const web = await createWebOrder({
      customerName: "Gabi",
      customerPhone: "5491100000007",
      notes: null,
      items: [{ name: productName, qty: 2 }],
      fulfillment: "retiro",
      customerAddress: null,
      deliveryZone: null,
    });
    // Simula el comportamiento viejo: descuenta el stock al aceptar y no crea pedido real.
    await getPool().query("update gestion_products set stock_qty = 8 where id = $1", [productId]);
    await getPool().query(
      `insert into gestion_stock_movements (product_id, type, quantity, reference_type, reference_id)
       values ($1, 'venta', -2, 'web_order', $2)`,
      [productId, web.id]
    );
    await getPool().query(
      "update gestion_web_orders set status = 'confirmado', eta_minutes = 15, kitchen_status = 'pendiente', kitchen_sent_at = now() where id = $1",
      [web.id]
    );

    const orderId = await ensurePosOrderForWebOrder(web.id);
    expect(await stock()).toBe(10); // repuesto
    expect(await ensurePosOrderForWebOrder(web.id)).toBe(orderId); // idempotente
    expect(await stock()).toBe(10);
    await finalizeOrder(orderId, [{ method: "efectivo", amount: price * 2 }], null);
    expect(await stock()).toBe(8); // descontado una sola vez
    await setStock(null);
  });

  it("no se puede abrir un pedido web que sigue pendiente", async () => {
    const web = await createWebOrder({
      customerName: "Hugo",
      customerPhone: "5491100000008",
      notes: null,
      items: [{ name: productName, qty: 1 }],
      fulfillment: "retiro",
      customerAddress: null,
      deliveryZone: null,
    });
    await expect(ensurePosOrderForWebOrder(web.id)).rejects.toThrow("Solo se pueden abrir");
  });
});
