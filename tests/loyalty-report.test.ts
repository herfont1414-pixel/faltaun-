import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { getLoyaltyReport, withReadOnly } from "@/lib/admin/loyalty-report";
import {
  burgerMilestones,
  papasMilestones,
  computeRetroactive,
  computeLegacy,
  detectDuplicates,
  checkConsistency,
  describeSource,
  type AccountRow,
} from "@/lib/admin/loyalty-report-calc";

const acc = (phone: string, stamps: number, extra: Partial<AccountRow> = {}): AccountRow => ({
  phone,
  name: extra.name ?? null,
  stamps,
  redeemed: extra.redeemed ?? 0,
  orderCount: extra.orderCount ?? stamps,
  totalSpent: 0,
  origin: null,
  updatedAt: null,
});

describe("hitos (reglas nuevas)", () => {
  it("papas en 5, 20, 35… y hamburguesa en 15, 30, 45…", () => {
    expect(papasMilestones(4)).toEqual([]);
    expect(papasMilestones(5)).toEqual([5]);
    expect(papasMilestones(19)).toEqual([5]);
    expect(papasMilestones(20)).toEqual([5, 20]);
    expect(papasMilestones(50)).toEqual([5, 20, 35, 50]);
    expect(burgerMilestones(14)).toEqual([]);
    expect(burgerMilestones(15)).toEqual([15]);
    expect(burgerMilestones(45)).toEqual([15, 30, 45]);
  });

  it("calcula por cliente y en total, sin incluir a quien no llegó a ningún hito", () => {
    const r = computeRetroactive([acc("1", 3), acc("2", 5), acc("3", 15), acc("4", 20), acc("5", 47)]);
    expect(r.rows.map((x) => x.phone)).toEqual(["5", "4", "3", "2"]);
    const by = Object.fromEntries(r.rows.map((x) => [x.phone, x]));
    expect([by["2"].papas, by["2"].burgers]).toEqual([1, 0]);
    expect([by["3"].papas, by["3"].burgers]).toEqual([1, 1]);
    expect([by["4"].papas, by["4"].burgers]).toEqual([2, 1]);
    expect([by["5"].papas, by["5"].burgers]).toEqual([3, 3]); // 5,20,35 y 15,30,45
    expect(r.clientsWithPapas).toBe(4);
    expect(r.clientsWithBurger).toBe(3);
    expect(r.totalPapas).toBe(1 + 1 + 2 + 3);
    expect(r.totalBurgers).toBe(0 + 1 + 1 + 3);
    expect(r.totalRewards).toBe(r.totalPapas + r.totalBurgers);
  });
});

describe("canjes del sistema anterior: separados de los premios nuevos", () => {
  it("no se mezclan ni se restan", () => {
    const accounts = [acc("1", 25, { redeemed: 2 }), acc("2", 9), acc("3", 5, { redeemed: 1 })];
    const legacy = computeLegacy(accounts);
    expect(legacy.totalRedeemed).toBe(3);
    expect(legacy.accountsWithRedeemed).toBe(2);
    expect(legacy.rows.find((r) => r.phone === "1")!.legacyEarned).toBe(2); // 25 / 10
    // Los premios nuevos se calculan sin descontar los canjes viejos.
    const retro = computeRetroactive(accounts);
    expect(retro.rows.find((r) => r.phone === "1")!.papas).toBe(2); // 5 y 20
    expect(retro.rows.find((r) => r.phone === "3")!.papas).toBe(1);
  });
});

describe("posibles cuentas duplicadas", () => {
  it("mismo número con distinto formato", () => {
    const d = detectDuplicates([
      acc("03755 15-589363", 6, { name: "A" }),
      acc("5493755589363", 2, { name: "B" }),
      acc("3755589363", 1),
      acc("5493751777001", 4),
    ]);
    expect(d.sameNumber).toHaveLength(1);
    expect(d.sameNumber[0].members.map((m) => m.phone).sort()).toEqual(["03755 15-589363", "3755589363", "5493755589363"]);
    expect(d.sameNumber[0].stampsSum).toBe(9);
    expect(d.ambiguous).toHaveLength(0);
  });

  it("terminan igual pero no coinciden al normalizar: ambiguos", () => {
    const d = detectDuplicates([acc("5493755589363", 3), acc("5491155589363", 2), acc("5493751000000", 1)]);
    expect(d.sameNumber).toHaveLength(0);
    expect(d.ambiguous).toHaveLength(1);
    expect(d.ambiguous[0].members.map((m) => m.phone).sort()).toEqual(["5491155589363", "5493755589363"]);
  });

  it("detecta formatos raros y no agrupa números cortos", () => {
    const d = detectDuplicates([acc("+54 9 3755 589363", 1), acc("12345", 1), acc("999", 1), acc("59899123456", 1)]);
    expect(d.formats.withSymbols.map((m) => m.phone)).toEqual(["+54 9 3755 589363"]);
    expect(d.formats.tooShort.map((m) => m.phone).sort()).toEqual(["12345", "999"]);
    expect(d.formats.otherFormat.map((m) => m.phone)).toEqual(["59899123456"]);
    expect(d.sameNumber).toHaveLength(0);
  });
});

describe("control de consistencia", () => {
  it("clasifica coincidencias, diferencias, sin historial y transacciones huérfanas", () => {
    const accounts = [acc("ok", 3), acc("dif", 5), acc("menos", 2), acc("viejo", 4), acc("cero", 0)];
    const c = checkConsistency(accounts, [
      { phone: "ok", count: 3, stampsSum: 3 },
      { phone: "dif", count: 3, stampsSum: 3 },
      { phone: "menos", count: 4, stampsSum: 4 },
      { phone: "huerfano", count: 2, stampsSum: 2 },
    ]);
    expect(c.consistent).toBe(2); // ok y cero (sin sellos ni historial)
    expect(c.mismatched.map((r) => [r.phone, r.diff]).sort()).toEqual([["dif", 2], ["menos", -2]]);
    expect(c.withoutHistory.map((r) => r.phone)).toEqual(["viejo"]);
    expect(c.orphanTransactions).toEqual([{ phone: "huerfano", txCount: 2, txStamps: 2 }]);
  });
});

describe("origen de los datos", () => {
  it("identifica producción, vista previa, PostgreSQL externo y SQLite local", () => {
    const url = "postgres://usuario:secreto@ep-abc.neon.tech:5432/madero?sslmode=require";
    const prod = describeSource({ mode: "postgres", databaseUrl: url, vercelEnv: "production" });
    expect(prod.level).toBe("produccion");
    expect(prod.warning).toBeNull();
    expect([prod.host, prod.database]).toEqual(["ep-abc.neon.tech", "madero"]);
    expect(describeSource({ mode: "postgres", databaseUrl: url, vercelEnv: "preview" }).level).toBe("preview");
    expect(describeSource({ mode: "postgres", databaseUrl: url }).level).toBe("postgres_externo");
    const local = describeSource({ mode: "sqlite", sqlitePath: "C:\\MaderoSys\\maderosys.db" });
    expect(local.level).toBe("local");
    expect(local.file).toBe("maderosys.db");
    expect(local.warning).toMatch(/NO son los datos de producción/);
  });

  it("nunca expone usuario, contraseña ni parámetros de la conexión", () => {
    const url = "postgres://usuario:secreto@ep-abc.neon.tech:5432/madero?sslmode=require&token=xyz";
    const dump = JSON.stringify(describeSource({ mode: "postgres", databaseUrl: url, vercelEnv: "production" }));
    for (const s of ["usuario", "secreto", "token", "xyz", "sslmode", "postgres://"]) expect(dump).not.toContain(s);
    expect(JSON.stringify(describeSource({ mode: "postgres", databaseUrl: "basura" }))).not.toContain("basura");
  });
});

// ---------- contra una base SQLite real (temporal) ----------

let dbPath: string;

async function dumpAll() {
  const pool = getPool();
  const { rows: tables } = await pool.query<{ name: string }>(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name"
  );
  const out: Record<string, unknown> = {};
  for (const t of tables) out[t.name] = (await pool.query(`select * from ${t.name}`)).rows;
  return out;
}

beforeAll(async () => {
  dbPath = await seedFreshDb("loyalty-report");
  const pool = getPool();
  await pool.query("delete from gestion_loyalty_accounts");
  const accounts: [string, number, number, string][] = [
    ["5493755589363", 20, 1, "Ana"],
    ["03755 15-589363", 6, 0, "Ana (otra carga)"],
    ["5493751777001", 15, 0, "Rita"],
    ["5493751000002", 3, 0, "Nuevo"],
  ];
  for (const [phone, stamps, redeemed, name] of accounts) {
    await pool.query(
      "insert into gestion_loyalty_accounts (phone, stamps, redeemed, name, order_count) values ($1, $2, $3, $4, $2)",
      [phone, stamps, redeemed, name]
    );
  }
  // Historial: Rita consistente, Nuevo con diferencia, un teléfono huérfano.
  const tx: [string, string, string][] = [];
  for (let i = 0; i < 15; i++) tx.push(["5493751777001", `rita-${i}`, "stamp"]);
  for (let i = 0; i < 2; i++) tx.push(["5493751000002", `nuevo-${i}`, "stamp"]);
  tx.push(["5490000000000", "huerfano-1", "stamp"]);
  for (const [phone, orderId, type] of tx) {
    await pool.query("insert into gestion_loyalty_transactions (phone, order_id, type, stamps) values ($1, $2, $3, 1)", [
      phone,
      orderId,
      type,
    ]);
  }
});

afterAll(() => tearDownTestDb(dbPath));

describe("informe sobre una base real (SQLite)", () => {
  it("arma el informe completo con los cálculos esperados", async () => {
    const report = await getLoyaltyReport();
    expect(report.source.level).toBe("local");
    expect(report.fingerprint.accounts).toBe(4);
    expect(report.fingerprint.totalStamps).toBe(44);
    expect(report.fingerprint.transactions).toBe(18);
    expect(report.retroactive.totalPapas).toBe(2 + 1 + 1); // 20→5,20 · 6→5 · 15→5
    expect(report.retroactive.totalBurgers).toBe(1 + 1); // 20→15 · 15→15
    expect(report.legacy.totalRedeemed).toBe(1);
    expect(report.duplicates.sameNumber).toHaveLength(1);
    expect(report.consistency.mismatched.map((r) => r.phone)).toEqual(["5493751000002"]);
    expect(report.consistency.orphanTransactions.map((t) => t.phone)).toEqual(["5490000000000"]);
    expect(report.consistency.withoutHistory.map((r) => r.phone).sort()).toEqual(["03755 15-589363", "5493755589363"]);
  });

  it("generar el informe no modifica NINGUNA tabla (ni cuentas, ni transacciones, ni el resto)", async () => {
    const before = await dumpAll();
    await getLoyaltyReport();
    await getLoyaltyReport();
    const after = await dumpAll();
    expect(after).toEqual(before);
    expect(Object.keys(after)).toEqual(Object.keys(before)); // ni tablas nuevas
  });

  it("la conexión de solo lectura de SQLite rechaza cualquier escritura", async () => {
    const pool = getPool();
    const before = await dumpAll();
    await expect(
      withReadOnly((q) => q("insert into gestion_meta (key, value) values ('hack', '1') returning key"))
    ).rejects.toThrow(/readonly|read-only|read only/i);
    await expect(
      withReadOnly((q) => q("delete from gestion_loyalty_accounts returning phone"))
    ).rejects.toThrow(/readonly|read-only|read only/i);
    await expect(
      withReadOnly((q) => q("update gestion_loyalty_accounts set stamps = 999 returning phone"))
    ).rejects.toThrow(/readonly|read-only|read only/i);
    expect(await dumpAll()).toEqual(before);
    expect(pool).toBeTruthy();
  });
});

describe("ausencia de escrituras e inicialización (revisión del código)", () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf-8");
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
  const files = [
    "lib/admin/loyalty-report.ts",
    "lib/admin/loyalty-report-calc.ts",
    "app/api/admin/loyalty-report/route.ts",
  ];

  it("no llama a funciones de inicialización/sincronización ni escribe en la base", () => {
    for (const f of files) {
      const code = stripComments(read(f));
      expect(code, f).not.toMatch(/ensureSeeded|seed|addStamp|recordAudit|createSession|syncCatalog/i);
      expect(code, f).not.toMatch(/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|alter\s+table|create\s+(table|index)|drop\s+|truncate)\b/i);
    }
  });

  it("todas las consultas son SELECT", () => {
    const code = read("lib/admin/loyalty-report.ts");
    const sqls = [...code.matchAll(/const SQL_\w+ = `([\s\S]*?)`;/g)].map((m) => m[1].trim());
    expect(sqls.length).toBeGreaterThanOrEqual(3);
    for (const sql of sqls) expect(sql).toMatch(/^select\b/i);
  });

  it("la ruta solo acepta GET y nunca registra auditoría", async () => {
    const code = stripComments(read("app/api/admin/loyalty-report/route.ts"));
    expect([...code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1])).toEqual(["GET"]);
    expect(code).not.toMatch(/export\s+(const|async function)\s+(POST|PUT|PATCH|DELETE)/);
  });

  it("PostgreSQL: usa una transacción de solo lectura con rollback", () => {
    const code = read("lib/admin/loyalty-report.ts");
    expect(code).toMatch(/begin read only/);
    expect(code).toMatch(/rollback/);
    expect(code).not.toMatch(/"commit"|'commit'/);
  });
});
