import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { nextDay, seedFreshDb, tearDownTestDb } from "./helpers";
import { addStamp, getLoyalty } from "@/lib/admin/loyalty";
import { getPool } from "@/lib/admin/db";

let dbPath: string;

beforeAll(async () => {
  dbPath = await seedFreshDb("loyalty");
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

describe("fidelidad: sello, doble pedido, premio", () => {
  it("un pedido suma exactamente un sello", async () => {
    const account = await addStamp("5493000000001", "order-a", { orderTotal: 5000 });
    expect(account.stamps).toBe(1);
    expect(account.orderCount).toBe(1);
    expect(account.totalSpent).toBe(5000);
  });

  it("llamar addStamp dos veces para el MISMO pedido no duplica el sello", async () => {
    const phone = "5493000000002";
    await addStamp(phone, "order-b", { orderTotal: 1000 });
    await addStamp(phone, "order-b", { orderTotal: 1000 }); // mismo orderId, doble submit

    const account = await getLoyalty(phone);
    expect(account.stamps).toBe(1);
    expect(account.orderCount).toBe(1);
    expect(account.totalSpent).toBe(1000);

    const pool = getPool();
    const { rows } = await pool.query(
      "select count(*) as count from gestion_loyalty_transactions where order_id = $1",
      ["order-b"]
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it("pedidos distintos sí suman sellos distintos", async () => {
    const phone = "5493000000003";
    for (let i = 0; i < 3; i++) {
      await addStamp(phone, `order-c-${i}`, { orderTotal: 100, now: nextDay() });
    }
    const account = await getLoyalty(phone);
    expect(account.stamps).toBe(3);
    expect(account.orderCount).toBe(3);
  });

  it("al llegar a 5 sellos hay un premio disponible (papas) y faltan 10 para el próximo (hamburguesa)", async () => {
    const phone = "5493000000004";
    for (let i = 0; i < 5; i++) {
      await addStamp(phone, `order-d-${i}`, { orderTotal: 100, now: nextDay() });
    }
    const account = await getLoyalty(phone);
    expect(account.stamps).toBe(5);
    expect(account.rewardsAvailable).toBe(1);
    expect(account.stampsToNextReward).toBe(10); // próximo hito: 15
  });

  it("tope: un solo sello por teléfono por día, aunque sean pedidos distintos", async () => {
    const phone = "5493000000005";
    const day = nextDay();
    const first = await addStamp(phone, "order-e-1", { orderTotal: 100, now: day });
    expect(first.stamp).toMatchObject({ awarded: true });
    const second = await addStamp(phone, "order-e-2", { orderTotal: 100, now: new Date(day.getTime() + 3 * 3600_000) });
    expect(second.stamp).toMatchObject({ awarded: false, reason: "daily_cap" });
    expect(second.stamps).toBe(1);
    // Otro teléfono el mismo día sí suma.
    expect((await addStamp("5493000000006", "order-e-3", { now: day })).stamp.awarded).toBe(true);
    // Al día siguiente vuelve a sumar.
    const next = await addStamp(phone, "order-e-4", { now: new Date(day.getTime() + 24 * 3600_000) });
    expect(next.stamp.awarded).toBe(true);
    expect(next.stamps).toBe(2);
  });

  it("tope: el día es el del local (UTC-3): 23:30 y 00:30 hora del local son días distintos", async () => {
    const phone = "5493000000007";
    // 23:30 del local = 02:30 UTC del día siguiente; 00:30 del local = 03:30 UTC.
    const late = new Date(Date.UTC(2031, 5, 10, 2, 30));
    const early = new Date(Date.UTC(2031, 5, 10, 3, 30));
    expect((await addStamp(phone, "order-f-1", { now: late })).stamp.awarded).toBe(true);
    expect((await addStamp(phone, "order-f-2", { now: early })).stamp.awarded).toBe(true);
  });

  it("tope: el mismo teléfono escrito distinto cuenta como el mismo cliente", async () => {
    const day = nextDay();
    await addStamp("5493755000123", "order-g-1", { now: day });
    const again = await addStamp("+54 9 3755 00-0123", "order-g-2", { now: day });
    expect(again.stamp).toMatchObject({ awarded: false, reason: "daily_cap" });
  });

  it("tope: cobros simultáneos de pedidos distintos del mismo teléfono suman un solo sello", async () => {
    const phone = "5493000000008";
    const day = nextDay();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => addStamp(phone, `order-h-${i}`, { now: day }).then((a) => a.stamp))
    );
    expect(results.filter((r) => r.awarded)).toHaveLength(1);
    expect((await getLoyalty(phone)).stamps).toBe(1);
  });

  it("registra qué usuario del panel dio el sello", async () => {
    await addStamp("5493000000009", "order-i-1", { userId: 42, now: nextDay() });
    const { rows } = await getPool().query("select user_id from gestion_loyalty_transactions where order_id = $1", ["order-i-1"]);
    expect(Number(rows[0].user_id)).toBe(42);
  });
});
