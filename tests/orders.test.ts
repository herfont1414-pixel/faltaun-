import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { openTable, addItem, setQty, finalizeOrder, getState } from "@/lib/admin/store";

let dbPath: string;

beforeAll(async () => {
  dbPath = await seedFreshDb("orders");
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

const firstProductId = anyInStockProduct;

describe("pedidos: crear, agregar producto, cambiar cantidad, cobrar", () => {
  it("abre una mesa, agrega un producto y refleja el total correcto", async () => {
    const product = await firstProductId();
    const order = await openTable(1, { partySize: 2 });
    await addItem(order.id, product.id);
    const state = await getState();
    const openOrder = state.openOrders.find((o) => o.id === order.id)!;
    expect(openOrder.items).toHaveLength(1);
    expect(openOrder.total).toBe(product.price);
  });

  it("cambiar la cantidad actualiza el total y bajar a 0 borra el ítem", async () => {
    const product = await firstProductId();
    const order = await openTable(2, {});
    await addItem(order.id, product.id);
    let state = await getState();
    const itemId = state.openOrders.find((o) => o.id === order.id)!.items[0].id;

    await setQty(order.id, itemId, 2);
    state = await getState();
    let openOrder = state.openOrders.find((o) => o.id === order.id)!;
    expect(openOrder.items[0].qty).toBe(3);
    expect(openOrder.total).toBe(product.price * 3);

    await setQty(order.id, itemId, -3);
    state = await getState();
    openOrder = state.openOrders.find((o) => o.id === order.id)!;
    expect(openOrder.items).toHaveLength(0);
  });

  it("cobrar cierra el pedido y libera la mesa", async () => {
    const product = await firstProductId();
    const order = await openTable(3, {});
    await addItem(order.id, product.id);

    const result = await finalizeOrder(order.id, [{ method: "efectivo", amount: product.price }], null);
    expect(result.total).toBe(product.price);

    const state = await getState();
    expect(state.openOrders.find((o) => o.id === order.id)).toBeUndefined();
    expect(state.closedOrders.find((o) => o.id === order.id)?.status).toBe("cerrada");
    expect(state.tables.find((t) => t.number === 3)?.status).toBe("libre");
  });

  it("un segundo cobro del mismo pedido se rechaza (no duplica la venta)", async () => {
    const product = await firstProductId();
    const order = await openTable(4, {});
    await addItem(order.id, product.id);
    await finalizeOrder(order.id, [{ method: "efectivo", amount: product.price }], null);

    await expect(
      finalizeOrder(order.id, [{ method: "efectivo", amount: product.price }], null)
    ).rejects.toThrow("ya fue cerrado");
  });

  it("el precio y el nombre del ítem se resuelven en el servidor, no se puede mandar un precio falso", async () => {
    const product = await firstProductId();
    const order = await openTable(5, {});
    // addItem solo recibe productId: no hay forma de que el llamador le
    // pase un precio o nombre propio, así que esto en sí mismo prueba el
    // diseño; acá se confirma que el precio guardado es el real del catálogo.
    await addItem(order.id, product.id);
    const state = await getState();
    const openOrder = state.openOrders.find((o) => o.id === order.id)!;
    expect(openOrder.items[0].price).toBe(product.price);
    expect(openOrder.items[0].name).toBe(product.name);
  });
});
