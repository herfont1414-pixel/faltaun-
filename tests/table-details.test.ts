import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { openTable, addItem, finalizeOrder, getState, updateTableDetails, createCounterOrder, setItemNote } from "@/lib/admin/store";
import { getPrintableOrder } from "@/lib/admin/print";
import { toComandaPrintData } from "@/lib/admin/print-templates";
import { openedSince } from "@/lib/admin/format";
import { getPool } from "@/lib/admin/db";

let dbPath: string;
beforeAll(async () => {
  dbPath = await seedFreshDb("table-details");
});
afterAll(() => tearDownTestDb(dbPath));

describe("editar mesa", () => {
  it("cambia personas, cliente y mozo de una mesa abierta sin tocar el pedido", async () => {
    const product = await anyInStockProduct();
    const order = await openTable(5, { partySize: 2, customerName: "Ana", waiter: "Juan" });
    await addItem(order.id, product.id);
    await updateTableDetails(order.id, { partySize: 4, customerName: "  Ana y amigos ", waiter: "Lucía" });
    const o = (await getState()).openOrders.find((x) => x.id === order.id)!;
    expect([o.partySize, o.customerName, o.waiter]).toEqual([4, "Ana y amigos", "Lucía"]);
    expect(o.items).toHaveLength(1);
    expect(o.total).toBe(product.price);
  });

  it("vacíos quedan sin dato; valida personas, mesa cerrada y pedidos que no son de mesa", async () => {
    const product = await anyInStockProduct();
    const order = await openTable(6, { partySize: 3, customerName: "X", waiter: "Y" });
    await updateTableDetails(order.id, { partySize: null, customerName: "", waiter: "  " });
    const o = (await getState()).openOrders.find((x) => x.id === order.id)!;
    expect([o.partySize, o.customerName, o.waiter]).toEqual([null, null, null]);
    await expect(updateTableDetails(order.id, { partySize: 0 })).rejects.toThrow(/personas/);
    await expect(updateTableDetails(order.id, { partySize: 2.5 })).rejects.toThrow(/personas/);
    const counter = await createCounterOrder("mostrador");
    await expect(updateTableDetails(counter.id, { partySize: 2 })).rejects.toThrow(/no es de una mesa/);
    await addItem(order.id, product.id);
    await finalizeOrder(order.id, [{ method: "efectivo", amount: product.price }], null);
    await expect(updateTableDetails(order.id, { partySize: 2 })).rejects.toThrow(/se cerró/);
    await expect(updateTableDetails("no-existe", {})).rejects.toThrow();
  });

  it("la comanda de una mesa trae personas, mozo y la aclaración de cada producto", async () => {
    const product = await anyInStockProduct();
    const order = await openTable(7, { partySize: 2, waiter: "Juan" });
    await addItem(order.id, product.id);
    const itemId = (await getState()).openOrders.find((x) => x.id === order.id)!.items[0].id;
    await setItemNote(order.id, itemId, "sin tomate");
    await getPool().query("update gestion_order_items set sent_to_kitchen = true where order_id = $1", [order.id]);
    const data = toComandaPrintData(await getPrintableOrder(order.id));
    expect([data.tableNumber, data.partySize, data.waiter, data.takeAway]).toEqual([7, 2, "Juan", false]);
    expect(data.areas.flatMap((a) => a.items).find((i) => i.name === product.name)!.note).toBe("sin tomate");
  });
});

describe("hora de apertura", () => {
  it("muestra la hora y el tiempo transcurrido", () => {
    const opened = new Date(2026, 9, 11, 20, 15).toISOString();
    const at = (min: number) => new Date(2026, 9, 11, 20, 15 + min).getTime();
    expect(openedSince(opened, at(35))).toMatch(/^20:15 \(35 min\)$/);
    expect(openedSince(opened, at(80))).toMatch(/\(1 h 20 min\)$/);
    expect(openedSince(opened, at(120))).toMatch(/\(2 h\)$/);
    expect(openedSince("basura")).toBe("");
  });
});
