// Elige con qué base de datos trabaja el servidor local de Windows:
//  - la MISMA que el sitio de Vercel (se pega una vez su DATABASE_URL y queda
//    guardada en .env.local, que no se sube a GitHub ni la toca el actualizador), o
//  - la base local de esta PC (maderosys.db), si se aprieta solo Enter.
// Se pregunta una sola vez: si .env.local ya tiene DATABASE_URL o MADERO_BASE,
// no hace nada. Lo ejecuta scripts/iniciar-local.bat.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const MAX_TRIES = 3;

const say = (message = "") => console.log(message);

function readEnvLines() {
  return existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
}

function alreadyConfigured(lines) {
  return lines.some((l) => /^\s*(DATABASE_URL|MADERO_BASE)\s*=\s*\S/.test(l));
}

function saveSetting(lines, key, value) {
  const kept = lines.filter((l) => !new RegExp(`^\\s*${key}\\s*=`).test(l));
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  kept.push(`${key}=${value}`);
  writeFileSync(ENV_FILE, kept.join("\n") + "\n", "utf8");
}

function maskUrl(url) {
  try {
    // Ni el usuario ni la clave se muestran: en algunas bases el usuario también es una credencial.
    const u = new URL(url);
    return `${u.protocol}//***:***@${u.host}${u.pathname}`;
  } catch {
    return "(direccion)";
  }
}

// Mismo criterio de conexion que usa la app (lib/admin/db.ts).
async function testConnection(url) {
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    max: 1,
  });
  try {
    const { rows } = await pool.query(
      "select count(*)::int as n from information_schema.tables where table_name = 'gestion_orders'"
    );
    return rows[0].n > 0
      ? { ok: true }
      : { ok: false, reason: "Se conecto, pero no es la base de MaderoSys (no tiene la tabla de pedidos)." };
  } catch (error) {
    const code = error.code ? ` [${error.code}]` : "";
    return { ok: false, reason: `No se pudo conectar${code}: ${String(error.message).split("\n")[0].slice(0, 140)}` };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  const lines = readEnvLines();
  if (alreadyConfigured(lines)) return 0;

  say("============================================================");
  say("  Conectar con la base de datos de Vercel");
  say("============================================================");
  say("Asi el panel de esta PC muestra los MISMOS datos (ventas, caja,");
  say("pedidos web) que madero14.vercel.app. Solo se hace esta vez.");
  say("");
  say("Como conseguir la direccion (DATABASE_URL):");
  say("  1. Entra a vercel.com y abri el proyecto \"maderosys\".");
  say("  2. Settings -> Environment Variables.");
  say("  3. Busca DATABASE_URL, toca el ojo para verla y copiala.");
  say("  4. Volve a esta ventana, pega con clic derecho y apreta Enter.");
  say("");
  say("Para NO conectar y seguir con la base local de esta PC, apreta solo Enter.");

  // Cola de líneas: funciona igual con el teclado y con una entrada que se
  // cierra (por ejemplo, cuando no hay nadie para contestar).
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const queue = [];
  let closed = false;
  let wake = null;
  rl.on("line", (line) => {
    queue.push(line);
    wake?.();
  });
  rl.on("close", () => {
    closed = true;
    wake?.();
  });
  const ask = async (prompt) => {
    process.stdout.write(prompt);
    while (queue.length === 0 && !closed) await new Promise((resolve) => (wake = resolve));
    wake = null;
    return queue.length > 0 ? queue.shift() : null;
  };

  try {
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const answer = await ask("\nDireccion: ");
      if (answer === null) return 0; // sin teclado (cerraron la entrada): no se guarda nada
      const value = answer.trim().replace(/^["']|["']$/g, "");

      if (value === "") {
        saveSetting(lines, "MADERO_BASE", "local");
        say("Listo: se usa la base local de esta PC. Para cambiarlo mas adelante, borra la linea MADERO_BASE de .env.local.");
        return 0;
      }
      if (!/^postgres(ql)?:\/\//i.test(value)) {
        say("Eso no parece una direccion de base de datos (tiene que empezar con postgres:// o postgresql://).");
        continue;
      }

      say("Probando la conexion...");
      const result = await testConnection(value);
      if (result.ok) {
        saveSetting(lines, "DATABASE_URL", value);
        say(`[OK] Conectado: ${maskUrl(value)}`);
        say("Desde ahora este panel usa la misma base que Vercel.");
        return 0;
      }
      say(result.reason);
    }
    say("No se pudo conectar. Por esta vez se usa la base local; se va a preguntar de nuevo la proxima vez.");
    return 1;
  } finally {
    rl.close();
  }
}

process.exit(await main());
