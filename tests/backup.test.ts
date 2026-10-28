import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { backupLocalDb, backupName, latestBackupAt, pruneBackups } from "@/lib/admin/backup";

let dbPath: string;
let dir: string;
let extra: string;

beforeAll(async () => {
  dbPath = await seedFreshDb("backup");
  dir = mkdtempSync(path.join(os.tmpdir(), "madero-copias-"));
  extra = mkdtempSync(path.join(os.tmpdir(), "madero-extra-"));
});
afterAll(() => {
  tearDownTestDb(dbPath);
  rmSync(dir, { recursive: true, force: true });
  rmSync(extra, { recursive: true, force: true });
});

describe("copias de seguridad de la base de la PC", () => {
  it("hace una copia comprimida y consistente, que se puede abrir y tiene los datos", async () => {
    await getPool().query("insert into gestion_meta (key, value) values ('prueba_copia', 'dato-importante') on conflict (key) do update set value = excluded.value");
    const now = new Date(2031, 2, 5, 14, 7);
    const result = await backupLocalDb(getPool(), { dir, extraDir: null, now, keepDays: 100_000 });
    expect(result!.file).toBe(path.join(dir, "maderosys-2031-03-05_1407.db.gz"));
    expect(result!.bytes).toBeGreaterThan(1000);
    expect(readdirSync(dir)).toEqual(["maderosys-2031-03-05_1407.db.gz"]); // sin archivos temporales

    // La copia es una base SQLite completa: se descomprime, se abre y tiene lo que se cargó.
    const restored = path.join(dir, "restaurada.db");
    writeFileSync(restored, gunzipSync(readFileSync(result!.file)));
    const Database = require("better-sqlite3");
    const copy = new Database(restored, { readonly: true });
    expect(copy.prepare("select value from gestion_meta where key = 'prueba_copia'").get().value).toBe("dato-importante");
    expect(copy.prepare("select count(*) as n from gestion_products").get().n).toBeGreaterThan(100);
    copy.close();
    for (const suffix of ["", "-wal", "-shm"]) rmSync(restored + suffix, { force: true });
  });

  it("también la deja en la carpeta extra (pendrive o carpeta sincronizada) y avisa si esa no está disponible", async () => {
    const ok = await backupLocalDb(getPool(), { dir, extraDir: extra, now: new Date(2031, 2, 5, 20, 0), keepDays: 100_000 });
    expect(ok!.extra).toBe(path.join(extra, "maderosys-2031-03-05_2000.db.gz"));
    expect(existsSync(ok!.extra!)).toBe(true);
    expect(ok!.extraError).toBeNull();
    // Una "unidad" que no existe: la copia principal sale igual y se informa el problema.
    const bad = await backupLocalDb(getPool(), { dir, extraDir: path.join(dir, "maderosys-2031-03-05_1407.db.gz", "no-puede-ser-carpeta"), now: new Date(2031, 2, 6, 8, 0), keepDays: 100_000 });
    expect(existsSync(bad!.file)).toBe(true);
    expect(bad!.extra).toBeNull();
    expect(bad!.extraError).toBeTruthy();
  });

  it("borra las copias de más de 30 días, pero nunca la más reciente", async () => {
    const old = path.join(dir, "maderosys-2031-01-01_0000.db.gz");
    writeFileSync(old, "x".repeat(200));
    const longAgo = new Date(Date.now() - 90 * 86_400_000);
    utimesSync(old, longAgo, longAgo);
    await pruneBackups(dir, 30);
    expect(existsSync(old)).toBe(false);
    // Aunque todas sean viejas, queda la última.
    for (const n of readdirSync(dir)) utimesSync(path.join(dir, n), longAgo, longAgo);
    await pruneBackups(dir, 30);
    expect(readdirSync(dir).filter((n) => n.endsWith(".db.gz"))).toHaveLength(1);
  });

  it("sabe cuándo fue la última copia", async () => {
    expect(await latestBackupAt(path.join(dir, "no-existe"))).toBeNull();
    const at = await latestBackupAt(dir);
    expect(at).toBeGreaterThan(0);
    expect(Math.abs(statSync(path.join(dir, readdirSync(dir)[0])).mtimeMs - at!)).toBeLessThan(1);
  });

  it("el nombre usa la hora local de la PC", () => {
    expect(backupName(new Date(2031, 11, 9, 3, 4))).toBe("maderosys-2031-12-09_0304.db.gz");
  });
});
