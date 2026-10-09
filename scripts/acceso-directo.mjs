// Crea en el Escritorio el acceso directo "MaderoSys" (con el trebol de Madero) que abre
// MaderoSys en una ventana propia. Se crea UNA sola vez: queda una marca
// (.acceso-directo-creado) para no volver a ponerlo si alguien lo borra del escritorio.
// Para que vuelva a crearse: borrar esa marca y abrir MaderoSys-Iniciar.bat.
// Lo ejecuta scripts\iniciar-local.bat; nunca frena el arranque.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DEFAULT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARK = ".acceso-directo-creado";
const LNK_NAME = "MaderoSys.lnk";

// Texto de PowerShell entre comillas simples (una ' se escribe '').
const ps = (text) => `'${text.replace(/'/g, "''")}'`;

export function buildShortcutScript({ lnk, target, workDir, icon }) {
  return [
    "$ws = New-Object -ComObject WScript.Shell",
    `$s = $ws.CreateShortcut(${ps(lnk)})`,
    `$s.TargetPath = ${ps(target)}`,
    `$s.WorkingDirectory = ${ps(workDir)}`,
    `$s.IconLocation = ${ps(icon)}`,
    "$s.Description = 'MaderoSys'",
    "$s.WindowStyle = 7", // minimizada: la ventana negra casi no se ve
    "$s.Save()",
  ].join("; ");
}

function runPowerShell(script) {
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

// Devuelve: "creado" | "ya_estaba" | "no_windows" | "error"
export function crear({ root = ROOT_DEFAULT, platform = process.platform, run = runPowerShell } = {}) {
  if (platform !== "win32") return "no_windows";
  if (existsSync(path.join(root, MARK))) return "ya_estaba";

  // El Escritorio puede estar redirigido (OneDrive): se le pregunta a Windows.
  const desktop = run("[Environment]::GetFolderPath('Desktop')");
  if (desktop.status !== 0 || !desktop.out) return "error";
  const lnk = path.win32.join(desktop.out, LNK_NAME);

  const made = run(
    buildShortcutScript({
      lnk,
      target: path.win32.join(root, "MaderoSys-Abrir.bat"),
      workDir: root,
      icon: path.win32.join(root, "public", "maderosys.ico"),
    })
  );
  if (made.status !== 0) return "error";
  writeFileSync(path.join(root, MARK), "El acceso directo ya se creo una vez. Borra este archivo para que se vuelva a crear.\n");
  return "creado";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (crear() === "creado") {
      console.log("[OK] Se creo el acceso directo \"MaderoSys\" en el Escritorio.");
    }
  } catch (error) {
    console.log("[Aviso] No se pudo crear el acceso directo (" + error.message + ").");
  }
}
