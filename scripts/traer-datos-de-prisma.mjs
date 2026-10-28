// Copia TODOS los datos de la base en la nube (Prisma/Vercel) a la base local de esta PC (maderosys.db).
// Se usa una sola vez, para pasar el sistema a la PC. REEMPLAZA los datos locales por los de la nube
// (antes se guarda una copia: maderosys.db.antes-de-traer-datos).
//
// Con MaderoSys CERRADO:   node scripts/traer-datos-de-prisma.mjs        (o doble clic en
// scripts\traer-datos-de-prisma.bat). La dirección de la base se toma de .env.local (DATABASE_URL,
// como ya la usa esta PC); si no está, la pide por teclado (no se muestra ni se guarda en ningún lado).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import pg from "pg";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_FILE = process.env.SQLITE_PATH || path.join(ROOT, "maderosys.db");
const say = (m = "") => console.log(m);

// Tablas que no se copian: son temporales de la base en la nube (sesiones abiertas, contadores de intentos).
const SKIP = new Set(["gestion_sessions", "gestion_rate_limits", "gestion_sync_inbox"]);
// Claves de gestion_meta propias de cada instalación (estado de la conexión con la nube, copias).
const SKIP_META = /^(sync_|pc_last_seen)/;

// Fechas "date" como texto (si no, la zona horaria de la PC las corre un día); números y enteros
// grandes como texto (no pierden precisión); el resto de los tipos se convierte abajo.
pg.types.setTypeParser(1082, (v) => v);

function envUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  return line ? line.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, "") : "";
}

const ask = (q) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => (rl.close(), resolve(a.trim())));
  });

const serverRunning = () =>
  new Promise((resolve) => {
    const s = net.connect({ port: 3000, host: "127.0.0.1" });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });

const sslFor = (url) => {
  try {
    return ["localhost", "127.0.0.1", "db"].includes(new URL(url).hostname) ? false : { rejectUnauthorized: false };
  } catch {
    return { rejectUnauthorized: false };
  }
};

function toSqlite(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function main() {
  if (await serverRunning()) {
    say("MaderoSys esta abierto. Cerralo (incluida la ventana negra del servidor) y volve a correr esto.");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(DB_FILE)) {
    say(`No existe la base local (${DB_FILE}). Abri MaderoSys una vez (modo SIN INTERNET), cerralo y volve a correr esto.`);
    process.exitCode = 1;
    return;
  }
  let url = envUrl();
  if (!url) url = await ask("Direccion de la base en la nube (empieza con postgres://, no se guarda): ");
  if (!url) return say("Sin direccion no se puede continuar.");

  say("Conectando con la base en la nube...");
  const pool = new pg.Pool({ connectionString: url, ssl: sslFor(url), max: 1, connectionTimeoutMillis: 20000 });
  let remote;
  try {
    remote = await pool.connect();
    const { rows } = await remote.query("select table_name from information_schema.tables where table_schema = 'public' and table_name like 'gestion\\_%' order by 1");
    if (!rows.some((r) => r.table_name === "gestion_orders")) throw new Error("Se conecto, pero no es la base de MaderoSys.");
    var remoteTables = rows.map((r) => r.table_name);
  } catch (error) {
    say(`No se pudo leer la base en la nube: ${error.message}`);
    say("Si dice que las consultas estan bloqueadas, primero hay que 'Restablecer el acceso durante 24 horas' en la consola de Prisma.");
    process.exitCode = 1;
    await pool.end().catch(() => {});
    return;
  }

  const Database = require("better-sqlite3");
  const local = new Database(DB_FILE);
  const localTables = new Set(local.prepare("select name from sqlite_master where type = 'table' and name like 'gestion\\_%' escape '\\'").all().map((r) => r.name));

  say(`\nBase en la nube: ${remoteTables.length} tablas. Esto REEMPLAZA los datos de esta PC (${DB_FILE}).`);
  const answer = await ask("Escribi SI para continuar: ");
  if (answer !== "SI") {
    say("Cancelado.");
    local.close();
    remote.release();
    await pool.end();
    return;
  }

  local.close();
  copyFileSync(DB_FILE, `${DB_FILE}.antes-de-traer-datos`);
  const db = new Database(DB_FILE);
  db.pragma("foreign_keys = OFF");

  const summary = [];
  const skipped = [];
  try {
    db.exec("begin");
    for (const table of remoteTables) {
      if (SKIP.has(table)) continue;
      if (!localTables.has(table)) {
        skipped.push(table);
        continue;
      }
      const localCols = db.prepare(`pragma table_info(${table})`).all().map((c) => c.name);
      const { rows: remoteColsRows } = await remote.query(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
        [table]
      );
      const cols = remoteColsRows.map((c) => c.column_name).filter((c) => localCols.includes(c));
      db.prepare(`delete from ${table}`).run();
      const insert = db.prepare(`insert into ${table} (${cols.join(", ")}) values (${cols.map(() => "?").join(", ")})`);
      let count = 0;
      const { rows } = await remote.query(`select ${cols.map((c) => `"${c}"`).join(", ")} from ${table}`);
      for (const row of rows) {
        if (table === "gestion_meta" && SKIP_META.test(String(row.key))) continue;
        insert.run(cols.map((c) => toSqlite(row[c])));
        count += 1;
      }
      summary.push([table, count]);
    }
    db.exec("commit");
  } catch (error) {
    try {
      db.exec("rollback");
    } catch {
      // nada que deshacer
    }
    say(`\nNo se pudo copiar: ${error.message}`);
    say("No se cambio nada: los datos de esta PC siguen como estaban.");
    process.exitCode = 1;
    db.close();
    remote.release();
    await pool.end();
    return;
  }

  const broken = db.prepare("pragma foreign_key_check").all();
  db.close();
  remote.release();
  await pool.end();

  say("\nCopiado:");
  for (const [t, n] of summary.filter(([, n]) => n > 0)) say(`  ${t.replace("gestion_", "")}: ${n}`);
  if (skipped.length) say(`\nTablas de la nube que esta version no tiene (no se copiaron): ${skipped.join(", ")}`);
  if (broken.length) say(`\nAviso: ${broken.length} filas apuntan a datos que no estan (se pueden ignorar si son referencias viejas).`);
  // Desde ahora esta PC usa SIEMPRE su base local: la direccion de la nube queda guardada pero apagada
  // (comentada) y se marca MADERO_BASE=local, asi ningun acceso vuelve a intentar con la base bloqueada.
  const envFile = path.join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    const lines = readFileSync(envFile, "utf8").split(/\r?\n/);
    const out = lines.map((l) => (/^\s*DATABASE_URL\s*=/.test(l) ? l.replace(/^\s*DATABASE_URL/, "#DATABASE_URL_ANTERIOR") : l));
    if (!out.some((l) => /^\s*MADERO_BASE\s*=/.test(l))) {
      while (out.length && out[out.length - 1].trim() === "") out.pop();
      out.push("MADERO_BASE=local");
    }
    writeFileSync(envFile, out.join("\n") + "\n", "utf8");
    say("(La PC queda usando su base local; la direccion de la nube quedo desactivada en .env.local)");
  }
  say("\n[OK] Listo. Los datos de la nube ya estan en esta PC. Abri MaderoSys.");
  say(`(La base anterior de esta PC quedo en ${DB_FILE}.antes-de-traer-datos)`);
}

main().catch((error) => {
  console.error("Error inesperado:", error.message);
  process.exitCode = 1;
});
