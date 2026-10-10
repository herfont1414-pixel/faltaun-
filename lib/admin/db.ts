import { Pool } from "pg";

export interface QueryResult<T = any> {
  rows: T[];
}

export interface DbClient {
  query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

// Consulta cruda de solo lectura: SQL sin parámetros, devuelve las filas.
export type ReadOnlyQuery = (sql: string) => Promise<any[]>;

export interface Db extends DbClient {
  connect(): Promise<DbClient & { release(): void }>;
  // Solo SQLite: abre una conexión aparte en modo solo lectura (el motor rechaza
  // cualquier escritura). En PostgreSQL se usa una transacción "read only".
  readOnly?<T>(fn: (query: ReadOnlyQuery) => Promise<T>): Promise<T>;
}

export type DbMode = "postgres" | "sqlite" | "none";

const globalForDb = globalThis as unknown as { __adminDb?: Db };

function isRunningOnVercel() {
  return Boolean(process.env.VERCEL);
}

export function getDbMode(): DbMode {
  if (process.env.DATABASE_URL) return "postgres";
  if (isRunningOnVercel()) return "none";
  return "sqlite";
}

export function isDbConfigured() {
  return getDbMode() !== "none";
}

export function getPool(): Db {
  if (globalForDb.__adminDb) return globalForDb.__adminDb;

  const mode = getDbMode();
  if (mode === "postgres") {
    const url = process.env.DATABASE_URL!;
    globalForDb.__adminDb = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
    }) as unknown as Db;
  } else if (mode === "sqlite") {
    // Cargado dinámicamente: better-sqlite3 es una dependencia opcional que
    // solo hace falta para correr la app localmente (modo offline).
    const { createSqliteDb } = require("@/lib/admin/sqlite-db");
    globalForDb.__adminDb = createSqliteDb();
  } else {
    throw new Error("DATABASE_URL no está configurada");
  }
  return globalForDb.__adminDb!;
}
