// Actualizador del modo local (Windows): baja la última versión publicada en
// GitHub y la aplica sobre esta carpeta, sin tocar los datos (maderosys.db),
// el PIN (.env.local) ni los componentes instalados (node_modules).
// Lo ejecuta MaderoSys-Iniciar.bat antes de arrancar. Si algo falla NO frena
// nada: devuelve un código distinto de 0 y el lanzador sigue con la versión
// que ya está instalada. Sin dependencias: solo Node y el "tar" de Windows 10+.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "herfont1414-pixel/faltaun-";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_FILE = path.join(ROOT, ".maderosys-version");
const BRANCH_FILE = path.join(ROOT, ".maderosys-branch");
const NEEDS_INSTALL_FILE = path.join(ROOT, ".needs-install");

// Carpetas que son 100% del repositorio: se dejan idénticas a la versión nueva
// (también se borran los archivos que ya no existen).
const MIRRORED_DIRS = ["app", "components", "lib", "db", "scripts", "public", "data", "tests"];
// Archivos de la raíz que NUNCA se pisan: datos, PIN, estado del actualizador y
// el propio lanzador (no se puede reemplazar un .bat mientras se ejecuta).
const ROOT_FILES_TO_KEEP = new Set([
  ".env.local",
  ".maderosys-version",
  ".maderosys-branch",
  ".needs-install",
  "MaderoSys-Iniciar.bat",
  "maderosys.db",
  "maderosys.db-wal",
  "maderosys.db-shm",
]);

// Nunca se borran, aunque una versión futura no los traiga: sin el actualizador
// la PC quedaría sin poder actualizarse sola.
const PROTECTED_FILES = new Set(["actualizar.mjs", "iniciar-local.bat"]);

const say = (message) => console.log("[Actualizar] " + message);
const sha256 = (file) => (existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : "");

function listFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

function mirror(src, dest) {
  if (existsSync(dest)) {
    const keep = new Set(listFiles(src));
    for (const rel of listFiles(dest)) {
      if (!keep.has(rel) && !PROTECTED_FILES.has(rel.split(path.sep).join("/"))) {
        rmSync(path.join(dest, rel), { force: true });
      }
    }
  }
  cpSync(src, dest, { recursive: true, force: true });
}

async function serverIsRunning() {
  try {
    await fetch("http://localhost:3000/admin/login", { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const branchFromFile = existsSync(BRANCH_FILE) ? readFileSync(BRANCH_FILE, "utf8").trim() : "";
  const branch = process.env.MADERO_BRANCH || branchFromFile || "main";
  if (!/^[\w./-]+$/.test(branch)) {
    say("Nombre de rama no valido. Se usa la version instalada.");
    return 1;
  }

  // Con el servidor abierto no se toca nada: reemplazar archivos en uso rompe la
  // app en pleno servicio. La actualización se aplica la próxima vez que se inicie.
  if (await serverIsRunning()) {
    say("El servidor ya esta abierto: se actualiza la proxima vez que lo inicies.");
    return 10;
  }

  let remote;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/commits/${branch}`, {
      headers: { Accept: "application/vnd.github.sha", "User-Agent": "MaderoSys-updater" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("GitHub respondio " + response.status);
    remote = (await response.text()).trim();
    if (!/^[0-9a-f]{40}$/.test(remote)) throw new Error("respuesta inesperada");
  } catch (error) {
    say("No se pudo consultar GitHub (" + (error.cause?.code || error.message) + "). Se usa la version instalada.");
    return 10;
  }

  const local = existsSync(VERSION_FILE) ? readFileSync(VERSION_FILE, "utf8").trim() : "";
  if (local === remote) {
    say("Ya tenes la ultima version (" + remote.slice(0, 7) + ").");
    return 10;
  }

  say("Hay una version nueva (" + remote.slice(0, 7) + "). Descargando...");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "maderosys-update-"));
  try {
    const response = await fetch(`https://github.com/${REPO}/archive/${remote}.tar.gz`, {
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok) throw new Error("la descarga fallo (HTTP " + response.status + ")");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 10000) throw new Error("el archivo descargado es demasiado chico");

    const archive = path.join(tmp, "nueva.tar.gz");
    const extracted = path.join(tmp, "x");
    writeFileSync(archive, bytes);
    mkdirSync(extracted);
    const untar = spawnSync("tar", ["-xzf", archive, "-C", extracted], { encoding: "utf8" });
    if (untar.status !== 0) {
      throw new Error("no se pudo descomprimir: " + (untar.stderr || untar.error?.message || "").trim().slice(0, 120));
    }
    const folders = readdirSync(extracted, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (folders.length !== 1) throw new Error("estructura inesperada en lo descargado");
    const source = path.join(extracted, folders[0].name);
    for (const required of ["package.json", "app", "lib", "components"]) {
      if (!existsSync(path.join(source, required))) throw new Error("falta " + required + " en lo descargado");
    }

    const lockBefore = sha256(path.join(ROOT, "package-lock.json"));

    for (const dir of MIRRORED_DIRS) {
      if (existsSync(path.join(source, dir))) mirror(path.join(source, dir), path.join(ROOT, dir));
    }
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.isFile() && !ROOT_FILES_TO_KEEP.has(entry.name)) {
        const from = path.join(source, entry.name);
        const to = path.join(ROOT, entry.name);
        // Si no cambió, no se toca: así nunca se reescribe un .bat que se está ejecutando.
        if (existsSync(to) && readFileSync(from).equals(readFileSync(to))) continue;
        cpSync(from, to, { force: true });
      }
    }

    if (sha256(path.join(ROOT, "package-lock.json")) !== lockBefore) writeFileSync(NEEDS_INSTALL_FILE, "1");
    rmSync(path.join(ROOT, ".next"), { recursive: true, force: true });
    writeFileSync(VERSION_FILE, remote);

    say("Listo: version " + remote.slice(0, 7) + " aplicada. Tu PIN y tus datos no se tocaron.");
    return 0;
  } catch (error) {
    say("No se pudo actualizar (" + error.message + "). Se usa la version instalada.");
    return 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

process.exit(await main());
