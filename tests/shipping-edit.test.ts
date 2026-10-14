import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anyInStockProduct, seedFreshDb, tearDownTestDb } from "./helpers";
import { addItem, createCounterOrder, createDeliveryOrder, finalizeOrder, setShippingCost } from "@/lib/admin/store";

let dbPath: string;
beforeAll(async () => {
  dbPath = await seedFreshDb("shipping-edit");
});
afterAll(() => tearDownTestDb(dbPath));

describe("precio del envío editable en el pedido", () => {
  it("cambia el envío del delivery abierto, el total lo incluye y el cobro usa el nuevo valor", async () => {
    const p = await anyInStockProduct();
    const order = await createDeliveryOrder({ name: "Caio", phone: "", address: "Torto", zone: null, shippingCost: 6000, channel: "mostrador" });
    await addItem(order.id, p.id);
    const updated = await setShippingCost(order.id, 4500);
    expect(Number(updated.shipping_cost)).toBe(4500);
    const result = await finalizeOrder(order.id, [{ method: "efectivo", amount: p.price + 4500 } as never], null, null);
    expect(result.total).toBe(p.price + 4500);
    await expect(setShippingCost(order.id, 100)).rejects.toThrow(/ya fue cobrado/);
  });

  it("valida el monto y que sea delivery", async () => {
    const order = await createDeliveryOrder({ name: "X", phone: "", address: "", zone: null, shippingCost: 0, channel: "mostrador" });
    await expect(setShippingCost(order.id, -1)).rejects.toThrow(/entre \$0/);
    await expect(setShippingCost(order.id, Number.NaN)).rejects.toThrow(/entre \$0/);
    expect(Number((await setShippingCost(order.id, 0)).shipping_cost)).toBe(0);
    const counter = await createCounterOrder();
    await expect(setShippingCost(counter.id, 1000)).rejects.toThrow(/Solo los pedidos de delivery/);
  });
});
