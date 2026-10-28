import { Pool } from "pg";
import { noteQuery } from "@/lib/admin/read-cache";

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
  // Solo SQLite: copia consistente de la base a un archivo (copias de seguridad de la PC).
  backupTo?(destPath: string): Promise<void>;
}

export type DbMode = "postgres" | "sqlite" | "none";

const globalForDb = globalThis as unknown as { __adminDb?: Db; __adminDbTracked?: { raw: Db; tracked: Db } };

function isRunningOnVercel() {
  return Boolean(process.env.VERCEL);
}

// Conexión cifrada (SSL) según dónde esté la base: las bases en la nube la exigen; la que corre en
// el mismo servidor (Docker: host "db", o localhost) no la ofrece. Se puede forzar con
// DATABASE_SSL=on|off. Una dirección con ?sslmode=... se respeta tal cual (la maneja pg).
export function sslOptionFor(url: string, override = process.env.DATABASE_SSL): false | { rejectUnauthorized: false } {
  if (override && /^(off|false|0|no|disable)$/i.test(override.trim())) return false;
  if (override && /^(on|true|1|yes|require)$/i.test(override.trim())) return { rejectUnauthorized: false };
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = url.includes("localhost") ? "localhost" : "";
  }
  if (["localhost", "127.0.0.1", "::1", "db", "postgres"].includes(host)) return false;
  return { rejectUnauthorized: false };
}

export function getDbMode(): DbMode {
  if (process.env.DATABASE_URL) return "postgres";
  if (isRunningOnVercel()) return "none";
  return "sqlite";
}

export function isDbConfigured() {
  return getDbMode() !== "none";
}

// Envuelve la base para avisarle a la caché de lecturas (read-cache.ts) de cada escritura,
// también las hechas dentro de una transacción (cliente de connect()).
function trackWrites(db: Db): Db {
  const wrapQuery = (target: any) => async (sql: string, params?: unknown[]) => {
    const result = await target.query(sql, params);
    noteQuery(sql);
    return result;
  };
  const wrapClient = (client: any) =>
    new Proxy(client, {
      get(target, prop) {
        if (prop === "query") return wrapQuery(target);
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  return new Proxy(db as any, {
    get(target, prop) {
      if (prop === "query") return wrapQuery(target);
      if (prop === "connect") return async () => wrapClient(await target.connect());
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Db;
}

export function getPool(): Db {
  const raw = getRawPool();
  if (globalForDb.__adminDbTracked?.raw !== raw) {
    globalForDb.__adminDbTracked = { raw, tracked: trackWrites(raw) };
  }
  return globalForDb.__adminDbTracked.tracked;
}

function getRawPool(): Db {
  if (globalForDb.__adminDb) return globalForDb.__adminDb;

  const mode = getDbMode();
  if (mode === "postgres") {
    const url = process.env.DATABASE_URL!;
    globalForDb.__adminDb = new Pool({
      connectionString: url,
      ssl: sslOptionFor(url),
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
