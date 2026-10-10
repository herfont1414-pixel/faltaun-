import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb } from "./helpers";
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
      await addStamp(phone, `order-c-${i}`, { orderTotal: 100 });
    }
    const account = await getLoyalty(phone);
    expect(account.stamps).toBe(3);
    expect(account.orderCount).toBe(3);
  });

  it("al llegar a 5 sellos hay un premio disponible (papas) y faltan 10 para el próximo (hamburguesa)", async () => {
    const phone = "5493000000004";
    for (let i = 0; i < 5; i++) {
      await addStamp(phone, `order-d-${i}`, { orderTotal: 100 });
    }
    const account = await getLoyalty(phone);
    expect(account.stamps).toBe(5);
    expect(account.rewardsAvailable).toBe(1);
    expect(account.stampsToNextReward).toBe(10); // próximo hito: 15
  });
});
