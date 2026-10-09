import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { browserCandidates, findBrowser, openWindow, serverUp } from "../scripts/abrir-ventana.mjs";
import { buildShortcutScript, crear } from "../scripts/acceso-directo.mjs";

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "madero-acceso-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("ventana de MaderoSys (abrir-ventana)", () => {
  const env = {
    "ProgramFiles": "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\Local\\AppData\\Local",
  } as unknown as NodeJS.ProcessEnv;

  it("prefiere Edge (viene con Windows) y después Chrome", () => {
    const list = browserCandidates(env);
    expect(list[0]).toBe("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(list.some((p: string) => p.endsWith("chrome.exe"))).toBe(true);
    expect(list.findIndex((p: string) => p.endsWith("msedge.exe"))).toBeLessThan(
      list.findIndex((p: string) => p.endsWith("chrome.exe"))
    );
  });

  it("usa el primero que exista y devuelve null si no hay ninguno", () => {
    const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    expect(findBrowser({ env, exists: (p) => p === chrome })).toBe(chrome);
    expect(findBrowser({ env, exists: () => false })).toBeNull();
  });

  it("abre en modo programa (--app) y, sin navegador conocido, con el predeterminado", () => {
    const calls: unknown[][] = [];
    const spawnImpl = (...args: unknown[]) => {
      calls.push(args);
      return { unref() {} };
    };
    expect(openWindow({ browser: "C:\\edge.exe", url: "http://localhost:3000/admin", spawnImpl: spawnImpl as never })).toBe("ventana");
    expect(calls[0][0]).toBe("C:\\edge.exe");
    expect(calls[0][1]).toEqual(["--app=http://localhost:3000/admin"]);

    expect(openWindow({ browser: null, url: "http://localhost:3000/admin", spawnImpl: spawnImpl as never })).toBe("navegador");
    expect(calls[1][0]).toBe("cmd");
    expect(calls[1][1]).toEqual(["/c", "start", "", "http://localhost:3000/admin"]);
  });

  it("detecta si el servidor está andando", async () => {
    expect(await serverUp("http://x", (async () => new Response("ok")) as unknown as typeof fetch)).toBe(true);
    expect(
      await serverUp("http://x", (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch)
    ).toBe(false);
  });
});

describe("acceso directo del escritorio", () => {
  it("el script de PowerShell escapa las comillas simples de las rutas", () => {
    const script = buildShortcutScript({
      lnk: "C:\\Users\\O'Brien\\Desktop\\MaderoSys.lnk",
      target: "C:\\MaderoSys\\MaderoSys-Abrir.bat",
      workDir: "C:\\MaderoSys",
      icon: "C:\\MaderoSys\\public\\maderosys.ico",
    });
    expect(script).toContain("CreateShortcut('C:\\Users\\O''Brien\\Desktop\\MaderoSys.lnk')");
    expect(script).toContain("TargetPath = 'C:\\MaderoSys\\MaderoSys-Abrir.bat'");
    expect(script).toContain("IconLocation = 'C:\\MaderoSys\\public\\maderosys.ico'");
    expect(script).toContain("$s.Save()");
  });

  it("se crea una sola vez, en el Escritorio que indique Windows, y no se vuelve a crear si lo borran", () => {
    const scripts: string[] = [];
    const run = (script: string) => {
      scripts.push(script);
      return script.includes("GetFolderPath")
        ? { status: 0, out: "C:\\Users\\Local\\OneDrive\\Escritorio", err: "" }
        : { status: 0, out: "", err: "" };
    };
    expect(crear({ root, platform: "win32", run })).toBe("creado");
    expect(scripts[1]).toContain("C:\\Users\\Local\\OneDrive\\Escritorio\\MaderoSys.lnk");
    expect(existsSync(path.join(root, ".acceso-directo-creado"))).toBe(true);

    expect(crear({ root, platform: "win32", run })).toBe("ya_estaba");
    expect(scripts).toHaveLength(2); // la segunda vez no ejecutó nada
  });

  it("si PowerShell falla no deja la marca (se reintenta en el próximo arranque) ni rompe nada", () => {
    expect(crear({ root, platform: "win32", run: () => ({ status: 1, out: "", err: "x" }) })).toBe("error");
    expect(existsSync(path.join(root, ".acceso-directo-creado"))).toBe(false);
  });

  it("fuera de Windows no hace nada", () => {
    expect(crear({ root, platform: "linux", run: () => ({ status: 0, out: "x", err: "" }) })).toBe("no_windows");
  });

  it("el icono es un .ico válido con el trébol de Madero (PNG de 192 px)", () => {
    const ico = readFileSync(path.join(process.cwd(), "public", "maderosys.ico"));
    expect(ico.readUInt16LE(0)).toBe(0); // reservado
    expect(ico.readUInt16LE(2)).toBe(1); // tipo: icono
    expect(ico.readUInt16LE(4)).toBe(1); // una imagen
    expect(ico[6]).toBe(192);
    const size = ico.readUInt32LE(14);
    const offset = ico.readUInt32LE(18);
    expect(offset + size).toBe(ico.length);
    expect(ico.subarray(offset, offset + 8).toString("hex")).toBe("89504e470d0a1a0a"); // firma PNG
  });

  it("MaderoSys-Abrir.bat sigue en CRLF y arranca el lanzador completo si el servidor no está", () => {
    const text = readFileSync(path.join(process.cwd(), "MaderoSys-Abrir.bat"), "utf8");
    expect(text.replace(/\r\n/g, "")).not.toMatch(/\n/);
    expect(text).toContain('node "scripts\\abrir-ventana.mjs"');
    expect(text).toContain('start "MaderoSys - Iniciar" cmd /c "MaderoSys-Iniciar.bat"');
  });

  it("el lanzador crea el acceso directo y abre la ventana propia (con respaldo al navegador)", () => {
    const text = readFileSync(path.join(process.cwd(), "scripts", "iniciar-local.bat"), "utf8");
    expect(text).toContain('node "scripts\\acceso-directo.mjs"');
    expect(text).toContain('node "scripts\\abrir-ventana.mjs"');
    expect(text).toContain('if errorlevel 1 start "" "http://localhost:3000/admin"');
    expect(text.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });
});
