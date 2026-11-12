import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { addStamp } from "@/lib/admin/loyalty";
import { importStamps } from "@/lib/admin/loyalty-import";
import { getLoyaltyRanking } from "@/lib/admin/loyalty-ranking";
import { GET as loyaltyGet } from "@/app/api/admin/loyalty/route";

let dbPath: string;
let encargadoId: number;
let mozoId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("loyalty-ranking");
  const mk = async (name: string, role: string) =>
    Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true) returning id", [name, hashPin("1122"), role])).rows[0].id);
  encargadoId = await mk("Encargado R", "encargado");
  mozoId = await mk("Mozo R", "mozo");
  await importStamps("Ana; 3755000201; 4; 30000\nBeto; 3755000202; 1; 5000\nCeci; 3755000203; 14; 99000", encargadoId);
  // Ana suma su 5.º sello hoy: gana las papas.
  await addStamp("3755000201", "rank-1", { orderTotal: 8000, name: "Ana" });
  await getPool().query("insert into gestion_loyalty_accounts (phone, name, stamps) values ('3755000204', 'Sin Sellos', 0)");
});
afterAll(() => tearDownTestDb(dbPath));

describe("tabla de sellos de fidelidad", () => {
  it("ordena por sellos y calcula el próximo premio, premios y actividad", async () => {
    const { rows, summary } = await getLoyaltyRanking();
    expect(rows.map((r) => r.name)).toEqual(["Ceci", "Ana", "Beto", "Sin Sellos"]);
    const [ceci, ana, beto] = rows;
    expect(ceci).toMatchObject({ stamps: 14, next: { rewardCode: "burger", milestone: 15, remaining: 1 }, pendingRewards: 0, stamps30d: 0 });
    expect(ana).toMatchObject({ stamps: 5, pendingRewards: 1, stamps30d: 1, orderCount: 5, next: { milestone: 15, remaining: 10 } });
    expect(ana.totalSpent).toBe(38000);
    expect(beto).toMatchObject({ stamps: 1, next: { rewardCode: "papas", milestone: 5, remaining: 4 } });
    for (const r of [ceci, ana, beto]) expect(r.lastStampAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rows[3].lastStampAt).toBeNull();
    expect(summary).toEqual({ customers: 3, totalStamps: 20, nearReward: 1, pendingRewards: 1, redeemedRewards: 0, activeLast30d: 1 });
  });

  it("la ruta ?ranking=1 es para admin y encargado (un mozo no)", async () => {
    const req = async (userId: number) =>
      new NextRequest("http://localhost/api/admin/loyalty?ranking=1", { headers: { cookie: `${SESSION_COOKIE}=${await createSession(userId)}` } });
    expect((await loyaltyGet(await req(mozoId))).status).toBe(401);
    const res = await loyaltyGet(await req(encargadoId));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rows[0].name).toBe("Ceci");
    expect(data.summary.customers).toBe(3);
  });
});
