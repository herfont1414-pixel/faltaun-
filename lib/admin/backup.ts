// Copias de seguridad de la base de la PC (SQLite). La PC es donde viven los datos del local:
// sin copias, si falla el disco se pierde todo. Cada copia es un archivo comprimido
// (maderosys-AAAA-MM-DD_HHMM.db.gz) en la carpeta "MaderoSys-Copias" del usuario de Windows
// (o MADERO_COPIAS_DIR). Opcional: MADERO_COPIAS_EXTRA = otra carpeta (pendrive, disco externo o
// una carpeta sincronizada con Google Drive/OneDrive) donde también se deja cada copia.
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import os from "node:os";
import path from "node:path";
import type { Db } from "@/lib/admin/db";

const PREFIX = "maderosys-";
const SUFFIX = ".db.gz";

export function backupDir() {
  return process.env.MADERO_COPIAS_DIR?.trim() || path.join(os.homedir(), "MaderoSys-Copias");
}

const pad = (n: number) => String(n).padStart(2, "0");
export function backupName(now: Date) {
  return `${PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${SUFFIX}`;
}

export interface BackupResult {
  file: string;
  bytes: number;
  extra: string | null;
  extraError: string | null;
}

export async function backupLocalDb(
  db: Db,
  options: { dir?: string; extraDir?: string | null; keepDays?: number; now?: Date } = {}
): Promise<BackupResult | null> {
  if (!db.backupTo) return null; // solo la base SQLite de la PC (PostgreSQL tiene su propio pg_dump)
  const dir = options.dir ?? backupDir();
  const extraDir = options.extraDir === undefined ? process.env.MADERO_COPIAS_EXTRA?.trim() || null : options.extraDir;
  const keepDays = options.keepDays ?? 30;
  const now = options.now ?? new Date();
  await mkdir(dir, { recursive: true });

  const name = backupName(now);
  const raw = path.join(dir, `${name}.tmp-${process.pid}`);
  const final = path.join(dir, name);
  try {
    await db.backupTo(raw);
    await pipeline(createReadStream(raw), createGzip({ level: 9 }), createWriteStream(`${final}.part`));
  } finally {
    await unlink(raw).catch(() => {});
  }
  const { size } = await stat(`${final}.part`);
  if (size < 100) {
    await unlink(`${final}.part`).catch(() => {});
    throw new Error("La copia de seguridad salió vacía");
  }
  const { rename } = await import("node:fs/promises");
  await rename(`${final}.part`, final);

  let extra: string | null = null;
  let extraError: string | null = null;
  if (extraDir) {
    try {
      await mkdir(extraDir, { recursive: true });
      extra = path.join(extraDir, name);
      await copyFile(final, extra);
    } catch (error) {
      extra = null;
      extraError = error instanceof Error ? error.message : String(error);
    }
  }

  for (const folder of [dir, extraDir].filter((d): d is string => !!d)) await pruneBackups(folder, keepDays, now);
  return { file: final, bytes: size, extra, extraError };
}

// Borra las copias de más de `keepDays` días (nunca la más reciente de la carpeta).
export async function pruneBackups(dir: string, keepDays: number, now = new Date()) {
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX)).sort();
  } catch {
    return;
  }
  const limit = now.getTime() - keepDays * 86_400_000;
  for (const n of names.slice(0, -1)) {
    const file = path.join(dir, n);
    try {
      if ((await stat(file)).mtimeMs < limit) await unlink(file);
    } catch {
      // ya no está
    }
  }
}

export async function latestBackupAt(dir = backupDir()): Promise<number | null> {
  try {
    const names = (await readdir(dir)).filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX));
    let latest = 0;
    for (const n of names) latest = Math.max(latest, (await stat(path.join(dir, n))).mtimeMs);
    return latest || null;
  } catch {
    return null;
  }
}

export interface BackupStatus {
  enabled: boolean;
  dir: string;
  lastAt: number | null;
  lastError: string | null;
  extraError: string | null;
}

const globalForBackup = globalThis as unknown as { __backupStatus?: BackupStatus; __backupStarted?: boolean };

export function getBackupStatus(): BackupStatus {
  return globalForBackup.__backupStatus ?? { enabled: false, dir: backupDir(), lastAt: null, lastError: null, extraError: null };
}

// Una copia al arrancar (si la última tiene más de 6 horas) y se revisa cada 30 minutos.
export function startBackupLoop(getDb: () => Promise<Db>) {
  if (globalForBackup.__backupStarted) return;
  globalForBackup.__backupStarted = true;
  const status: BackupStatus = { enabled: true, dir: backupDir(), lastAt: null, lastError: null, extraError: null };
  globalForBackup.__backupStatus = status;
  const everyMs = Math.max(1, Number(process.env.MADERO_COPIAS_CADA_HORAS) || 6) * 3_600_000;

  async function check() {
    try {
      const last = await latestBackupAt(status.dir);
      status.lastAt = last;
      if (!last || Date.now() - last >= everyMs) {
        const result = await backupLocalDb(await getDb());
        if (result) {
          status.lastAt = Date.now();
          status.extraError = result.extraError;
        }
      }
      status.lastError = null;
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : String(error);
      console.warn(`[copias] No se pudo hacer la copia de seguridad: ${status.lastError}`);
    } finally {
      setTimeout(check, 30 * 60_000).unref?.();
    }
  }
  setTimeout(check, 90_000).unref?.();
}
