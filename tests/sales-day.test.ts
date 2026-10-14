import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { anyInStockProduct, seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { addItem, createCounterOrder, finalizeOrder, openTable, setItemNote } from "@/lib/admin/store";
import { getSalesDay, jornadaKey } from "@/lib/admin/sales-day";
import { GET as salesGet } from "@/app/api/admin/sales-day/route";

let dbPath: string;
let product: { id: number; name: string; price: number };
let adminId: number;
let mozoId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("sales-day");
  const p = await anyInStockProduct();
  product = { id: p.id, name: p.name, price: p.price };
  const mk = async (name: string, role: string) =>
    Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true) returning id", [name, hashPin("9999"), role])).rows[0].id);
  adminId = await mk("Leo", "admin");
  mozoId = await mk("Mozo Juan", "mozo");
});
afterAll(() => tearDownTestDb(dbPath));

async function cobrar(orderId: string, amount: number, method = "efectivo", closedAt?: string) {
  await finalizeOrder(orderId, [{ method, amount } as never], null, adminId);
  await getPool().query(
    "insert into gestion_audit_log (user_id, action, entity, entity_id) values ($1, 'order_close', 'gestion_orders', $2)",
    [adminId, orderId]
  );
  if (closedAt) await getPool().query("update gestion_orders set closed_at = $2 where id = $1", [orderId, closedAt]);
}

describe("ventas de la jornada", () => {
  it("jornada de 6:00 a 6:00: la 1 de la madrugada es de la noche anterior", () => {
    // 01:00 del 15/10 en Argentina = 04:00 UTC → jornada del 14/10.
    expect(jornadaKey(new Date("2026-10-15T04:00:00Z"))).toBe("2026-10-14");
    // 07:00 del 15/10 en Argentina = 10:00 UTC → jornada del 15/10.
    expect(jornadaKey(new Date("2026-10-15T10:00:00Z"))).toBe("2026-10-15");
  });

  it("separa mesas y mostrador, suma por mesa, por pago y por mozo, y trae ítems y quién cobró", async () => {
    // Mesa 3: 2 personas, mozo Pedro, 2 unidades con nota.
    const mesa = await openTable(3, { partySize: 2, waiter: "Pedro" });
    await addItem(mesa.id, product.id);
    const withItem = await addItem(mesa.id, product.id);
    void withItem;
    const { rows: items } = await getPool().query("select id from gestion_order_items where order_id = $1", [mesa.id]);
    await setItemNote(mesa.id, String(items[0].id), "sin sal");
    await cobrar(mesa.id, product.price * 2, "transferencia", "2026-10-14T23:30:00Z"); // 20:30 AR
    // Mostrador a la 1:15 de la madrugada (todavía jornada del 14).
    const mostrador = await createCounterOrder();
    await addItem(mostrador.id, product.id);
    await cobrar(mostrador.id, product.price, "efectivo", "2026-10-15T04:15:00Z");
    // Otra venta al día siguiente (no entra).
    const otra = await createCounterOrder();
    await addItem(otra.id, product.id);
    await cobrar(otra.id, product.price, "efectivo", "2026-10-15T15:00:00Z");

    const day = await getSalesDay("2026-10-14", new Date("2026-10-20T15:00:00Z"));
    expect(day.isToday).toBe(false);
    expect(day.count).toBe(2);
    expect(day.total).toBe(product.price * 3);
    expect(day.byKind.map((k) => [k.kind, k.count])).toEqual(
      expect.arrayContaining([["mesa", 1], ["mostrador", 1]])
    );
    expect(day.byTable).toEqual([{ tableNumber: 3, zone: "Salón", total: product.price * 2, count: 1, people: 2 }]);
    expect(day.byPayment).toEqual(
      expect.arrayContaining([
        { method: "transferencia", total: product.price * 2, count: 1 },
        { method: "efectivo", total: product.price, count: 1 },
      ])
    );
    expect(day.byWaiter).toEqual([{ waiter: "Pedro", total: product.price * 2, count: 1 }]);
    const sale = day.sales.find((s) => s.tableNumber === 3)!;
    expect(sale.label).toBe("Mesa 3");
    expect(sale.closedBy).toBe("Leo");
    expect(sale.partySize).toBe(2);
    expect(sale.items.reduce((s, it) => s + it.qty, 0)).toBe(2);
    expect(sale.items.some((it) => it.note === "sin sal")).toBe(true);
    // Más reciente primero: el mostrador de la madrugada va arriba.
    expect(day.sales[0].kind).toBe("mostrador");
    expect(day.open).toEqual([]); // jornadas pasadas no muestran "en curso"
  });

  it("la jornada actual muestra lo que está en curso con su total parcial", async () => {
    const mesa = await openTable(7, { partySize: 4, waiter: "Ana" });
    await addItem(mesa.id, product.id);
    const day = await getSalesDay(jornadaKey());
    expect(day.isToday).toBe(true);
    const open = day.open.find((o) => o.tableNumber === 7)!;
    expect(open.total).toBe(product.price);
    expect(open.closedAt).toBeNull();
  });

  it("solo admin y encargado; fecha inválida da error", async () => {
    const req = async (userId: number | null, q = "") =>
      salesGet(
        new NextRequest(`http://localhost/api/admin/sales-day${q}`, {
          headers: userId ? { cookie: `${SESSION_COOKIE}=${await createSession(userId)}` } : {},
        })
      );
    expect((await req(null)).status).toBe(401);
    expect((await req(mozoId)).status).toBe(401);
    const ok = await req(adminId, "?date=2026-10-14");
    expect(ok.status).toBe(200);
    expect((await ok.json()).day.count).toBe(2);
    expect((await req(adminId, "?date=ayer")).status).toBe(400);
  });
});
