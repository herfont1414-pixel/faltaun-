// Conecta la PC del local con el menú online (la "nube"): guarda en .env.local la dirección del
// menú online y la clave de conexión (SYNC_TOKEN). Desde ahí el servidor de la PC le manda el menú
// y baja los pedidos web y reservas solo (ver lib/admin/sync.ts).
// Se pregunta una sola vez: si .env.local ya tiene CLOUD_SYNC_URL o NUBE=no, no hace nada.
// "node scripts/configurar-nube.mjs --forzar" lo vuelve a preguntar (lo usa conectar-nube.bat).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const FORCE = process.argv.includes("--forzar");
const say = (message = "") => console.log(message);

const readLines = () => (existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : []);
const hasKey = (lines, key) => lines.some((l) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`).test(l));

function save(key, value) {
  const kept = readLines().filter((l) => !new RegExp(`^\\s*${key}\\s*=`).test(l));
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  kept.push(`${key}=${value}`);
  writeFileSync(ENV_FILE, kept.join("\n") + "\n", "utf8");
}
function remove(key) {
  const kept = readLines().filter((l) => !new RegExp(`^\\s*${key}\\s*=`).test(l));
  writeFileSync(ENV_FILE, kept.join("\n").replace(/\n+$/, "") + "\n", "utf8");
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

// Llama a la nube con la clave: confirma que la dirección y la clave están bien.
async function probe(url, token) {
  try {
    const res = await fetch(`${url}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ v: 1, ack: { web: [], reserva: [] }, publish: {}, tracking: [] }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, reason: "La clave no es la correcta." };
    if (res.status === 429) return { ok: false, reason: "Demasiados intentos con clave incorrecta. Esperá un rato." };
    if (res.status === 404) return { ok: false, reason: "Esa dirección no es la del menú online conectable (¿está en modo nube?)." };
    return { ok: false, reason: `La nube respondió ${res.status}.` };
  } catch (error) {
    return { ok: false, reason: `No se pudo llegar a esa dirección (${error.cause?.code || error.message}).` };
  }
}

async function main() {
  const lines = readLines();
  if (!FORCE && (hasKey(lines, "CLOUD_SYNC_URL") || hasKey(lines, "NUBE"))) return;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  say("");
  say("------------------------------------------------------------");
  say(" Conectar con el menu online (la nube)");
  say("------------------------------------------------------------");
  say(" Si el menu online esta en su propio servidor, esta PC le manda");
  say(" el menu y los precios y baja los pedidos web y las reservas.");
  say(" Hace falta la direccion del menu online y la clave de conexion.");
  say(" Si todavia no los tenes, toca solo Enter (se puede hacer despues");
  say(" con el acceso 'MaderoSys-Conectar-Nube').");
  say("");
  for (let i = 0; i < 3; i++) {
    let url = await ask(rl, " Direccion del menu online (ej: https://madero.midominio.com.ar): ");
    if (!url) {
      if (!FORCE) save("NUBE", "no");
      say(" Listo: se puede conectar mas adelante.");
      rl.close();
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    url = url.replace(/\/+$/, "");
    const token = await ask(rl, " Clave de conexion: ");
    say(" Probando la conexion...");
    const result = await probe(url, token);
    if (result.ok) {
      save("CLOUD_SYNC_URL", url);
      save("SYNC_TOKEN", token);
      // Los mensajes de WhatsApp a los clientes llevan la dirección del menú online (se usa al armar la app).
      save("NEXT_PUBLIC_MENU_URL", url);
      remove("NUBE");
      say(" [OK] Conectado. El menu y los pedidos web se sincronizan solos.");
      rl.close();
      return;
    }
    say(` No se pudo conectar: ${result.reason}`);
  }
  say(" No se conecto. Se puede reintentar con 'MaderoSys-Conectar-Nube'.");
  rl.close();
}

main().catch((error) => {
  console.error("No se pudo configurar la conexion con la nube:", error.message);
});
