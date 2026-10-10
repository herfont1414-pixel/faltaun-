import path from "node:path";
import crypto from "node:crypto";
import type { Db, DbClient } from "@/lib/admin/db";

const BOOLEAN_COLUMNS = new Set([
  "active",
  "in_stock",
  "show_online",
  "cuenta_corriente",
  "sent_to_kitchen",
  "deleted",
  "is_delivery",
  "paper_saving_mode",
  "habilitado",
  "direct_print_enabled",
]);

function bindValue(p: unknown) {
  if (typeof p === "boolean") return p ? 1 : 0;
  if (p instanceof Date) return p.toISOString();
  return p;
}

// Los placeholders $1, $2... de Postgres no siempre aparecen en el texto en
// orden ascendente (ej: "...total = $2... where id = $1"). SQLite solo
// soporta "?" posicionales, así que hay que reordenar los parámetros según
// el número real de cada $N, no según dónde aparece en el texto.
function translateQuery(sql: string, params: unknown[]) {
  const order: number[] = [];
  const text = sql
    .replace(/\$(\d+)/g, (_, n: string) => {
      order.push(Number(n) - 1);
      return "?";
    })
    .replace(/\bilike\b/gi, "like")
    .replace(/\bfor update(\s+of\s+\w+)?/gi, "");
  const reordered = order.map((i) => bindValue(params[i]));
  return { text, params: reordered };
}

function coerceRow<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const out = { ...row } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (BOOLEAN_COLUMNS.has(key) && (out[key] === 0 || out[key] === 1)) {
      out[key] = out[key] === 1;
    }
  }
  return out as T;
}

export function createSqliteDb(): Db {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require("better-sqlite3");
  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), "maderosys.db");
  const conn = new Database(dbPath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.function("gen_random_uuid", () => crypto.randomUUID());
  conn.function("now", () => new Date().toISOString());

  function runQuery<T>(sql: string, params: unknown[] = []): { rows: T[] } {
    const { text, params: boundParams } = translateQuery(sql, params);
    let stmt;
    try {
      stmt = conn.prepare(text);
    } catch (error) {
      if (error instanceof Error && error.message.includes("more than one statement")) {
        conn.exec(text);
        return { rows: [] };
      }
      throw error;
    }
    if (stmt.reader) {
      const rows = (stmt.all(...boundParams) as T[]).map(coerceRow);
      return { rows };
    }
    stmt.run(...boundParams);
    return { rows: [] };
  }

  const client: DbClient = {
    async query<T = unknown>(sql: string, params: unknown[] = []) {
      return runQuery<T>(sql, params);
    },
  };

  // SQLite acá es una única conexión compartida: serializa las transacciones
  // (begin...commit) para que dos cobros simultáneos no se pisen entre sí.
  let lock: Promise<void> = Promise.resolve();

  return {
    ...client,
    // Conexión propia en modo solo lectura (y query_only): SQLite rechaza cualquier
    // escritura aunque el código lo intentara. No toca la conexión de escritura.
    async readOnly<T>(fn: (query: (sql: string) => Promise<any[]>) => Promise<T>): Promise<T> {
      const ro = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        ro.pragma("query_only = ON");
        return await fn(async (sql) => (ro.prepare(sql).all() as unknown[]).map(coerceRow));
      } finally {
        ro.close();
      }
    },
    async connect() {
      const previous = lock;
      let releaseLock!: () => void;
      lock = new Promise((resolve) => {
        releaseLock = resolve;
      });
      await previous;
      return { ...client, release: releaseLock };
    },
  };
}
