// Restaura la base de la PC desde una copia de seguridad (maderosys-AAAA-MM-DD_HHMM.db.gz).
// IMPORTANTE: con MaderoSys cerrado. Antes de pisar la base actual se guarda una copia de ella
// (maderosys.db.antes-de-restaurar). Uso:  node scripts/restaurar-copia.mjs [archivo.db.gz]
// Sin archivo, muestra las copias disponibles para elegir.
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB = path.join(ROOT, "maderosys.db");
const DIR = process.env.MADERO_COPIAS_DIR?.trim() || path.join(os.homedir(), "MaderoSys-Copias");

const serverRunning = () =>
  new Promise((resolve) => {
    const socket = net.connect({ port: 3000, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });

const ask = (q) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => (rl.close(), resolve(a.trim())));
  });

async function main() {
  if (await serverRunning()) {
    console.log("MaderoSys esta abierto. Cerralo (incluida la ventana negra del servidor) y volve a correr esto.");
    process.exitCode = 1;
    return;
  }
  let file = process.argv[2];
  if (!file) {
    const list = existsSync(DIR)
      ? readdirSync(DIR).filter((n) => /^maderosys-.*\.db\.gz$/.test(n)).sort().reverse().slice(0, 15)
      : [];
    if (list.length === 0) {
      console.log(`No hay copias en ${DIR}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Copias disponibles en ${DIR}:\n`);
    list.forEach((n, i) => console.log(` ${i + 1}) ${n}  (${new Date(statSync(path.join(DIR, n)).mtimeMs).toLocaleString("es-AR")})`));
    const n = Number(await ask("\nNumero de la copia a restaurar (Enter para cancelar): "));
    if (!n || !list[n - 1]) return console.log("Cancelado.");
    file = path.join(DIR, list[n - 1]);
  }
  if (!existsSync(file)) {
    console.log(`No existe ${file}`);
    process.exitCode = 1;
    return;
  }
  const answer = await ask(`Esto REEMPLAZA los datos actuales por los de:\n  ${file}\nEscribi SI para continuar: `);
  if (answer !== "SI") return console.log("Cancelado.");

  const data = gunzipSync(readFileSync(file));
  if (data.length < 100 || data.subarray(0, 15).toString("latin1") !== "SQLite format 3") {
    console.log("El archivo no es una copia valida de MaderoSys.");
    process.exitCode = 1;
    return;
  }
  if (existsSync(DB)) copyFileSync(DB, `${DB}.antes-de-restaurar`);
  for (const suffix of ["-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  writeFileSync(DB, data);
  console.log("\n[OK] Datos restaurados. Ya podes abrir MaderoSys.");
  if (existsSync(`${DB}.antes-de-restaurar`)) console.log("Los datos anteriores quedaron en maderosys.db.antes-de-restaurar");
}

main();
