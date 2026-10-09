import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { createCounterOrder, addItem, setQty, finalizeOrder, getState, updateProduct } from "@/lib/admin/store";
import { getMenuItems, getMenuHighlights } from "@/lib/menu";
import { getPool } from "@/lib/admin/db";

let dbPath: string;

beforeAll(async () => {
  dbPath = await seedFreshDb("highlights");
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

// Vende `qty` unidades del producto en un pedido cerrado.
async function sell(productId: number, qty: number) {
  const order = await createCounterOrder();
  await addItem(order.id, productId);
  const current = (await getState()).openOrders.find((o) => o.id === order.id)!;
  if (qty > 1) await setQty(order.id, current.items[0].id, qty - 1);
  const total = (await getState()).openOrders.find((o) => o.id === order.id)!.total;
  await finalizeOrder(order.id, [{ method: "efectivo", amount: total }], null);
}

async function setMeta(entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) {
    await getPool().query(
      "insert into gestion_meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
      [key, value]
    );
  }
}

describe("destacados del menú público", () => {
  it("sin ventas no se inventa un ranking, y sin especial configurado no hay especial", async () => {
    const items = await getMenuItems();
    const h = await getMenuHighlights(items);
    expect(h).toEqual({ popularIds: [], special: null });
  });

  it("lo más pedido sale de las ventas: ordenado, sin adicionales y sin agotados", async () => {
    const state = await getState();
    const all = Object.values(state.catalog).flat();
    const pick = all.filter((p) => !/extra|adicional|doble carne/i.test(p.name)).slice(0, 5);
    const extra = all.find((p) => /extra/i.test(p.name));
    for (const p of [...pick, ...(extra ? [extra] : [])]) {
      await updateProduct(p.id, { active: true, inStock: true, stockQty: null });
    }
    const [a, b, c, d, e] = pick;
    await sell(a.id, 3);
    await sell(b.id, 5); // el más vendido
    await sell(c.id, 2);
    await sell(d.id, 1);
    await sell(e.id, 1);
    if (extra) await sell(extra.id, 9); // vendió más que todos, pero es un adicional

    // se agota "e": no debe figurar como disponible
    await updateProduct(e.id, { stockQty: 0 });

    const items = await getMenuItems();
    const h = (await getMenuHighlights(items))!;
    const nameOf = (id: string) => items.find((i) => i.id === id)!.name;
    expect(h.popularIds.map(nameOf)).toEqual([b.name, a.name, c.name, d.name]);
    if (extra) expect(h.popularIds.map(nameOf)).not.toContain(extra.name);
  });

  it("con menos de 3 productos con ventas la sección no aparece", async () => {
    const items = await getMenuItems();
    const only = items.slice(0, 2).map((i) => i.id);
    await getPool().query("delete from gestion_order_items where product_name not in (select name from gestion_products where id in ($1, $2))", only.map(Number));
    const h = (await getMenuHighlights(items))!;
    expect(h.popularIds).toEqual([]);
  });

  it("especial del día: activo, con texto breve; apagado o con producto inexistente no se muestra", async () => {
    const items = await getMenuItems();
    const target = items[0];
    await setMeta({ menu_special_active: "1", menu_special_id: target.id, menu_special_text: "  Con papas y bebida  " });
    expect((await getMenuHighlights(items))!.special).toEqual({ id: target.id, text: "Con papas y bebida" });

    await setMeta({ menu_special_active: "0" });
    expect((await getMenuHighlights(items))!.special).toBeNull();

    await setMeta({ menu_special_active: "1", menu_special_id: "999999" });
    expect((await getMenuHighlights(items))!.special).toBeNull();
  });

  it("el precio que se muestra es siempre el vigente del catálogo", async () => {
    const items = await getMenuItems();
    const target = items[0];
    await updateProduct(Number(target.id), { price: target.price + 500 });
    const after = await getMenuItems();
    expect(after.find((i) => i.id === target.id)!.price).toBe(target.price + 500);
  });
});
