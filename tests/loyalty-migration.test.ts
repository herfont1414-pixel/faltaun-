import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setUpTestDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { ensureDefaultRewards, listRewards, updateReward } from "@/lib/admin/loyalty";

let dbPath: string;
afterAll(() => tearDownTestDb(dbPath));

// Esquema "viejo": el actual sin el bloque de la Etapa 2 (premios y canjes).
function legacySchema(file: string) {
  const sql = readFileSync(path.join(process.cwd(), "db", file), "utf-8");
  const at = sql.indexOf("-- Etapa 2 de fidelidad");
  expect(at).toBeGreaterThan(0);
  return sql.slice(0, at);
}

describe("migración aditiva de la Etapa 2 sobre una base existente (SQLite)", () => {
  it("crea las tablas nuevas sin tocar cuentas, transacciones ni canjes viejos, y sin generar premios", async () => {
    dbPath = setUpTestDb("loyalty-migration");
    const pool = getPool();
    await pool.query(legacySchema("schema.sqlite.sql"));
    const before = await pool.query("select name from sqlite_master where name like 'gestion_loyalty_%'");
    expect(before.rows.map((r: any) => r.name)).not.toContain("gestion_loyalty_grants");

    await pool.query(
      "insert into gestion_loyalty_accounts (phone, stamps, redeemed, name, order_count, total_spent) values ('5493000500001', 7, 1, 'Vieja', 7, 700)"
    );
    await pool.query("insert into gestion_loyalty_transactions (phone, order_id, type, stamps, amount) values ('5493000500001', 'o-1', 'stamp', 1, 100)");
    const snapshot = async () =>
      JSON.stringify([
        (await pool.query("select * from gestion_loyalty_accounts")).rows,
        (await pool.query("select * from gestion_loyalty_transactions")).rows,
      ]);
    const legacy = await snapshot();

    await ensureSeeded();

    const tables = (await pool.query("select name from sqlite_master where type = 'table' and name like 'gestion_loyalty_%'")).rows.map((r: any) => r.name);
    expect(tables).toEqual(expect.arrayContaining(["gestion_loyalty_rewards", "gestion_loyalty_grants"]));
    expect(await snapshot()).toBe(legacy); // datos viejos idénticos
    expect(Number((await pool.query("select count(*) as n from gestion_loyalty_grants")).rows[0].n)).toBe(0); // sin retroactivos
    const rewards = await listRewards();
    expect(rewards.map((r) => [r.code, r.firstMilestone, r.step])).toEqual([["papas", 5, 15], ["burger", 15, 15]]);
    expect(rewards[0].productName).toBe("Papas Fritas"); // vinculado por ID
  });

  it("es repetible: volver a correrla no duplica premios ni pisa lo que editó el administrador", async () => {
    const [papas] = await listRewards();
    await updateReward(papas.id, { name: "Papas (editado)", active: false }, null);
    await ensureDefaultRewards(getPool());
    await ensureDefaultRewards(getPool());
    const rewards = await listRewards();
    expect(rewards).toHaveLength(2);
    expect(rewards[0]).toMatchObject({ name: "Papas (editado)", active: false });
  });

  it("las restricciones de la base están en el esquema (unicidad por cliente e hito, estado coherente)", async () => {
    const pool = getPool();
    const [papas] = await listRewards();
    await pool.query("insert into gestion_loyalty_grants (phone, reward_id, milestone) values ('x', $1, 5)", [papas.id]);
    await expect(pool.query("insert into gestion_loyalty_grants (phone, reward_id, milestone) values ('x', $1, 5)", [papas.id])).rejects.toThrow(/unique/i);
    await expect(
      pool.query("insert into gestion_loyalty_grants (phone, reward_id, milestone, status) values ('y', $1, 5, 'canjeado')", [papas.id])
    ).rejects.toThrow(/check/i); // canjeado exige fecha de canje
    await expect(pool.query("insert into gestion_loyalty_grants (phone, reward_id, milestone, status) values ('z', $1, 5, 'otro')", [papas.id])).rejects.toThrow(/check/i);
  });
});
