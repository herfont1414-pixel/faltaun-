import { Pool } from "pg";

const globalForDb = globalThis as unknown as { __adminPool?: Pool };

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está configurada");
  }
  if (!globalForDb.__adminPool) {
    globalForDb.__adminPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }
  return globalForDb.__adminPool;
}
