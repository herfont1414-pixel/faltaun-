import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { cleanItemNote, createWebOrder, respondWebOrder, listWebOrders } from "@/lib/admin/web-orders";
import { getKitchenTickets } from "@/lib/admin/kitchen";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";

let dbPath: string;
let product: { id: number; name: string; price: number };

const base = {
  customerName: "Ana",
  customerPhone: "5493000900001",
  notes: null,
  fulfillment: "retiro" as const,
  customerAddress: null,
  deliveryZone: null,
};

beforeAll(async () => {
  dbPath = await seedFreshDb("item-notes");
  const p = await anyInStockProduct();
  product = { id: p.id, name: p.name, price: p.price };
});
afterAll(() => tearDownTestDb(dbPath));

describe("aclaración por producto en el pedido online", () => {
  it("limpia el texto: una línea, sin caracteres raros, hasta 120 caracteres; vacío = sin aclaración", () => {
    expect(cleanItemNote("  sin   tomate \n y sin cebolla ")).toBe("sin tomate y sin cebolla");
    expect(cleanItemNote("x".repeat(200))).toHaveLength(120);
    expect(cleanItemNote("   ")).toBeNull();
    expect(cleanItemNote(undefined)).toBeNull();
    expect(cleanItemNote(42)).toBeNull();
  });

  it("se guarda por línea: el mismo producto con y sin aclaración son líneas distintas", async () => {
    const web = await createWebOrder({
      ...base,
      items: [
        { name: product.name, qty: 1, note: "sin tomate" },
        { name: product.name, qty: 2 },
      ],
    });
    expect(web.items).toEqual([
      { name: product.name, qty: 1, price: product.price, note: "sin tomate" },
      { name: product.name, qty: 2, price: product.price },
    ]);
    expect(web.total).toBe(product.price * 3);
  });

  it("el stock se controla con el total del producto entre todas sus líneas", async () => {
    await getPool().query("update gestion_products set stock_qty = 2, in_stock = true where id = $1", [product.id]);
    await expect(
      createWebOrder({
        ...base,
        items: [
          { name: product.name, qty: 1, note: "sin tomate" },
          { name: product.name, qty: 2 },
        ],
      })
    ).rejects.toThrow("No hay suficiente stock");
    await getPool().query("update gestion_products set stock_qty = null, in_stock = true where id = $1", [product.id]);
  });

  it("al aceptarlo, la aclaración pasa al pedido del panel (comanda) y a la pantalla de cocina", async () => {
    const web = await createWebOrder({ ...base, items: [{ name: product.name, qty: 1, note: "bien cocida, sin cebolla" }, { name: product.name, qty: 1 }] });
    const { orderId } = await respondWebOrder(web.id, "confirmado", 20);
    const { rows } = await getPool().query("select product_name, qty, note from gestion_order_items where order_id = $1 order by note", [orderId]);
    expect(rows.map((r: any) => [r.qty, r.note ?? null]).sort()).toEqual([[1, "bien cocida, sin cebolla"], [1, null]].sort());
    const ticket = (await getKitchenTickets()).find((t) => t.id === orderId)!;
    expect(ticket.items.map((i) => i.note ?? null).sort()).toEqual(["bien cocida, sin cebolla", null].sort());
    const listed = (await listWebOrders()).find((o) => o.id === web.id)!;
    expect(listed.items[0].note).toBe("bien cocida, sin cebolla");
  });

  it("el mensaje de WhatsApp del pedido muestra la aclaración debajo del producto", () => {
    const link = buildOrderWhatsAppLink({
      customerName: "Ana",
      items: [{ name: "Burger Clasica", qty: 1, price: 9000, note: "sin tomate" }, { name: "Papas Fritas", qty: 1, price: 7500 }],
      fulfillment: "retiro",
      subtotal: 16500,
      shippingCost: 0,
      total: 16500,
      businessNumber: "3755300822",
    });
    const text = decodeURIComponent(link.split("text=")[1]);
    expect(text).toContain("• 1x Burger Clasica ($9.000)\n   ↳ sin tomate\n• 1x Papas Fritas");
  });
});
