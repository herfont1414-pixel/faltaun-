// Abre MaderoSys en una ventana propia, tipo programa (sin pestañas ni barra de direcciones),
// usando Edge (viene con Windows) o Chrome en modo "--app". Si no hay ninguno, abre el
// navegador de siempre.
// Codigos de salida: 0 = se abrio, 2 = el servidor todavia no esta andando (el que lo llama,
// MaderoSys-Abrir.bat, arranca entonces el lanzador completo).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const APP_URL = "http://localhost:3000/admin";
const HEALTH_URL = "http://localhost:3000/admin/login";

export function browserCandidates(env = process.env) {
  const pf = env["ProgramFiles"];
  const pf86 = env["ProgramFiles(x86)"];
  const local = env.LOCALAPPDATA;
  const list = [];
  for (const base of [pf86, pf]) if (base) list.push(path.win32.join(base, "Microsoft", "Edge", "Application", "msedge.exe"));
  for (const base of [pf, pf86, local]) if (base) list.push(path.win32.join(base, "Google", "Chrome", "Application", "chrome.exe"));
  return list;
}

export function findBrowser({ env = process.env, exists = existsSync } = {}) {
  return browserCandidates(env).find((candidate) => exists(candidate)) ?? null;
}

export async function serverUp(url = HEALTH_URL, fetchImpl = fetch) {
  try {
    await fetchImpl(url, { signal: AbortSignal.timeout(2500) });
    return true;
  } catch {
    return false;
  }
}

export function openWindow({ browser, url = APP_URL, spawnImpl = spawn }) {
  if (browser) {
    spawnImpl(browser, [`--app=${url}`], { detached: true, stdio: "ignore" }).unref();
    return "ventana";
  }
  spawnImpl("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  return "navegador";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!(await serverUp())) process.exit(2);
  openWindow({ browser: findBrowser() });
  process.exit(0);
}
