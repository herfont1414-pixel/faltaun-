import path from "node:path";
import { getDbMode, getPool } from "@/lib/admin/db";
import type { ReadOnlyQuery } from "@/lib/admin/db";
import { businessDayKey } from "@/lib/admin/business-day";
import {
  STAFF_PAIR_THRESHOLD,
  STAFF_WINDOW_DAYS,
  buildLoyaltyReport,
  describeSource,
  type AccountRow,
  type LoyaltyReport,
  type RawLoyaltyData,
  type TxAggregate,
} from "@/lib/admin/loyalty-report-calc";

// INFORME DE SOLO LECTURA. Este módulo únicamente ejecuta SELECT y nunca llama a
// ensureSeeded ni a ninguna función de inicialización, sincronización o escritura
// (eso lo comprueba tests/loyalty-report.test.ts). Protecciones del motor:
//  - PostgreSQL: todo corre dentro de "begin read only"; la base rechaza escrituras.
//  - SQLite: se abre una conexión aparte con readonly + query_only.

// Consultas fijas, sin parámetros. Solo lectura.
const SQL_ACCOUNTS = `
  select phone, name, stamps, redeemed, order_count, total_spent, origin, updated_at
  from gestion_loyalty_accounts
  order by phone`;
const SQL_TX_BY_PHONE = `
  select phone, count(*) as n, coalesce(sum(stamps), 0) as stamps_sum
  from gestion_loyalty_transactions
  where type = 'stamp'
  group by phone`;
const SQL_TX_TYPES = `
  select type, count(*) as n, max(created_at) as last_at
  from gestion_loyalty_transactions
  group by type`;

// Sellos por empleado desde `since` (AAAA-MM-DD, generado acá mismo y validado: no viene del usuario).
function staffQueries(since: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("Fecha inválida");
  return {
    byUser: `
      select t.user_id, u.name as user_name, count(*) as n, count(distinct t.phone) as phones
      from gestion_loyalty_transactions t
      left join gestion_users u on u.id = t.user_id
      where t.type = 'stamp' and t.stamp_day >= '${since}'
      group by t.user_id, u.name
      order by count(*) desc`,
    pairs: `
      select t.user_id, u.name as user_name, t.phone, a.name as customer_name, count(*) as n
      from gestion_loyalty_transactions t
      left join gestion_users u on u.id = t.user_id
      left join gestion_loyalty_accounts a on a.phone = t.phone
      where t.type = 'stamp' and t.stamp_day >= '${since}' and t.user_id is not null
      group by t.user_id, u.name, t.phone, a.name
      having count(*) >= ${STAFF_PAIR_THRESHOLD}
      order by count(*) desc
      limit 20`,
  };
}

const num = (v: unknown) => (typeof v === "string" ? parseFloat(v) : Number(v ?? 0));

export async function withReadOnly<T>(fn: (query: ReadOnlyQuery) => Promise<T>): Promise<T> {
  const pool = getPool();
  // SQLite: conexión propia de solo lectura.
  if (pool.readOnly) return pool.readOnly(fn);

  // PostgreSQL: transacción de solo lectura, con tope de tiempo, siempre con rollback.
  const client = await pool.connect();
  try {
    await client.query("begin read only");
    await client.query("set local statement_timeout = '20s'");
    return await fn(async (sql) => (await client.query(sql)).rows);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

export async function readRawLoyaltyData(): Promise<RawLoyaltyData> {
  return withReadOnly(async (query) => {
    const accountRows = await query(SQL_ACCOUNTS);
    const txRows = await query(SQL_TX_BY_PHONE);
    const typeRows = await query(SQL_TX_TYPES);

    const accounts: AccountRow[] = accountRows.map((r) => ({
      phone: String(r.phone),
      name: r.name ?? null,
      stamps: num(r.stamps),
      redeemed: num(r.redeemed),
      orderCount: num(r.order_count),
      totalSpent: num(r.total_spent),
      origin: r.origin ?? null,
      updatedAt: r.updated_at ? String(r.updated_at) : null,
    }));
    const txs: TxAggregate[] = txRows.map((r) => ({
      phone: String(r.phone),
      count: num(r.n),
      stampsSum: num(r.stamps_sum),
    }));
    const transactionTypes = typeRows.map((r) => ({ type: String(r.type), count: num(r.n) }));
    const lastTransaction =
      typeRows
        .map((r) => (r.last_at ? String(r.last_at) : null))
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null;
    const sinceDay = businessDayKey(new Date(Date.now() - STAFF_WINDOW_DAYS * 24 * 60 * 60 * 1000));
    const staffSql = staffQueries(sinceDay);
    const byUser = (await query(staffSql.byUser)).map((r) => ({
      userId: r.user_id === null || r.user_id === undefined ? null : num(r.user_id),
      userName: r.user_name ?? null,
      stamps: num(r.n),
      phones: num(r.phones),
    }));
    const repeatedPairs = (await query(staffSql.pairs)).map((r) => ({
      userId: num(r.user_id),
      userName: r.user_name ?? null,
      phone: String(r.phone),
      customerName: r.customer_name ?? null,
      stamps: num(r.n),
    }));
    return { accounts, txs, transactionTypes, lastTransaction, staff: { sinceDay, byUser, repeatedPairs } };
  });
}

export async function getLoyaltyReport(): Promise<LoyaltyReport> {
  const source = describeSource({
    mode: getDbMode(),
    databaseUrl: process.env.DATABASE_URL,
    vercelEnv: process.env.VERCEL_ENV,
    sqlitePath: process.env.SQLITE_PATH || path.join(process.cwd(), "maderosys.db"),
  });
  const raw = await readRawLoyaltyData();
  return buildLoyaltyReport(raw, source);
}
