import { rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { ensureSeeded } from "@/lib/admin/seed";
import { createSqliteDb } from "@/lib/admin/sqlite-db";
import type { Db } from "@/lib/admin/db";

const globalForDb = globalThis as unknown as { __adminDb?: Db };

// Cada archivo de test usa su propia base SQLite temporal, así se pueden
// correr los tests sin tocar maderosys.db ni necesitar un Postgres real —
// es el mismo "modo local" que ya usa la app para funcionar sin internet.
//
// getPool() en producción carga sqlite-db.ts con un require() dinámico por
// ruta con alias (@/...) a propósito, para que los bundlers de Next/Vercel
// puedan excluirlo de los despliegues que no lo necesitan — pero ese
// require() no lo resuelve el runtime de Vitest (no entiende alias de TS
// ni extensiones .ts en un require crudo). Para no tocar ese código de
// producción, el test importa sqlite-db.ts de forma normal (eso sí lo
// resuelve Vitest) y deja el resultado en el mismo global que getPool()
// consulta primero, así getPool() nunca llega a ejecutar el require.
export function setUpTestDb(name: string) {
  const dbPath = path.join(os.tmpdir(), `maderosys-test-${name}-${crypto.randomUUID()}.db`);
  delete process.env.DATABASE_URL;
  process.env.SQLITE_PATH = dbPath;
  globalForDb.__adminDb = createSqliteDb();
  return dbPath;
}

export function tearDownTestDb(dbPath: string) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(dbPath + suffix, { force: true });
    } catch {
      // nada que limpiar
    }
  }
}

export async function seedFreshDb(name: string) {
  const dbPath = setUpTestDb(name);
  await ensureSeeded();
  return dbPath;
}

// El catálogo semilla trae productos marcados sin stock a propósito (son
// datos reales del local); los tests necesitan uno garantizado disponible,
// así que se fuerza en vez de confiar en cuál sea el primero del catálogo.
export async function anyInStockProduct() {
  const { getState, updateProduct } = await import("@/lib/admin/store");
  const state = await getState();
  const first = Object.values(state.catalog)[0][0];
  await updateProduct(first.id, { active: true, inStock: true, stockQty: null });
  return { ...first, inStock: true };
}
