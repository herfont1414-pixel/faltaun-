// Inicio automatico de MaderoSys con Windows: deja en la carpeta "Inicio" del usuario un
// acceso (MaderoSys-Autoinicio.vbs) que, al encender la PC e iniciar sesion, abre el
// lanzador en una ventana minimizada (se actualiza solo y arranca el servidor). Asi,
// al abrir el navegador en http://localhost:3000 ya esta todo listo.
//
// Lo ejecuta scripts\iniciar-local.bat en cada arranque; es idempotente (si ya esta, no
// hace nada y no escribe nada). Para quitarlo: MaderoSys-Quitar-Inicio-Automatico.bat
// (crea un archivo ".sin-inicio-automatico" para que no se vuelva a instalar solo).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DEFAULT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VBS_NAME = "MaderoSys-Autoinicio.vbs";
const OPT_OUT = ".sin-inicio-automatico";

// Comillas de VBScript: " dentro de un texto se escribe "".
const vbsText = (text) => `"${text.replace(/"/g, '""')}"`;

export function startupDir(env = process.env) {
  return env.APPDATA ? path.win32.join(env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup") : null;
}

// Contenido del acceso. MADERO_AUTO=1 le avisa al lanzador que es un arranque automatico:
// ventana del servidor minimizada, sin abrir el navegador y sin esperar una tecla.
export function buildVbs(root) {
  const bat = path.win32.join(root, "MaderoSys-Iniciar.bat");
  const command = `cmd /c "set MADERO_AUTO=1&& "${bat}""`;
  return [
    "' MaderoSys: arranque automatico con Windows (lo crea scripts\\autoinicio.mjs).",
    "' Para quitarlo: MaderoSys-Quitar-Inicio-Automatico.bat",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = ${vbsText(root)}`,
    `sh.Run ${vbsText(command)}, 7, False`,
    "",
  ].join("\r\n");
}

// Devuelve: "instalado" | "actualizado" | "ya_estaba" | "desactivado" | "no_windows"
export function instalar({ root = ROOT_DEFAULT, dir = startupDir(), platform = process.platform } = {}) {
  if (platform !== "win32" || !dir) return "no_windows";
  if (existsSync(path.join(root, OPT_OUT))) return "desactivado";
  const target = path.join(dir, VBS_NAME);
  const content = buildVbs(root);
  const existed = existsSync(target);
  if (existed && readFileSync(target, "latin1") === content) return "ya_estaba";
  mkdirSync(dir, { recursive: true });
  writeFileSync(target, content, "latin1"); // WScript lee ANSI
  return existed ? "actualizado" : "instalado";
}

export function quitar({ root = ROOT_DEFAULT, dir = startupDir(), platform = process.platform } = {}) {
  if (platform !== "win32" || !dir) return "no_windows";
  rmSync(path.join(dir, VBS_NAME), { force: true });
  writeFileSync(path.join(root, OPT_OUT), "No se instala solo el inicio automatico. Borra este archivo para volver a activarlo.\n");
  return "quitado";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes("--quitar")) {
      const r = quitar();
      console.log(r === "quitado" ? "[OK] Inicio automatico desactivado. MaderoSys ya no arranca solo con Windows." : "Esto solo funciona en Windows.");
    } else {
      const r = instalar();
      if (r === "instalado" || r === "actualizado") {
        console.log("[OK] Inicio automatico activado: desde ahora MaderoSys arranca solo al encender la PC.");
      }
    }
  } catch (error) {
    // Nunca frena el arranque: es un extra.
    console.log("[Aviso] No se pudo configurar el inicio automatico (" + error.message + ").");
  }
}
