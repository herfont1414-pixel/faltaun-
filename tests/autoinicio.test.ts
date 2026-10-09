import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildVbs, instalar, quitar, startupDir } from "../scripts/autoinicio.mjs";

let root: string;
let dir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "madero-root-"));
  dir = mkdtempSync(path.join(os.tmpdir(), "madero-startup-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
});

describe("inicio automático con Windows", () => {
  it("el acceso arranca el lanzador con MADERO_AUTO=1, minimizado, y las comillas quedan bien", () => {
    const vbs = buildVbs("C:\\MaderoSys");
    expect(vbs).toContain('sh.CurrentDirectory = "C:\\MaderoSys"');
    // En VBScript cada comilla del comando va duplicada: cmd /c "set MADERO_AUTO=1&& "C:\MaderoSys\MaderoSys-Iniciar.bat""
    expect(vbs).toContain(
      'sh.Run "cmd /c ""set MADERO_AUTO=1&& ""C:\\MaderoSys\\MaderoSys-Iniciar.bat""""", 7, False'
    );
    expect(vbs.split("\r\n").length).toBeGreaterThan(4); // finales de línea de Windows
    expect(vbs).not.toMatch(/[^\r]\n/);
  });

  it("la ruta con espacios también queda entre comillas", () => {
    expect(buildVbs("C:\\Mis Programas\\MaderoSys")).toContain('""C:\\Mis Programas\\MaderoSys\\MaderoSys-Iniciar.bat""');
  });

  it("instala una vez, no reescribe si ya está y se actualiza si cambia la carpeta", () => {
    expect(instalar({ root, dir, platform: "win32" })).toBe("instalado");
    const target = path.join(dir, "MaderoSys-Autoinicio.vbs");
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "latin1")).toContain("MADERO_AUTO=1");
    expect(instalar({ root, dir, platform: "win32" })).toBe("ya_estaba");

    const moved = mkdtempSync(path.join(os.tmpdir(), "madero-root2-"));
    expect(instalar({ root: moved, dir, platform: "win32" })).toBe("actualizado");
    rmSync(moved, { recursive: true, force: true });
  });

  it("quitar lo borra y evita que se reinstale solo; borrar la marca lo reactiva", () => {
    instalar({ root, dir, platform: "win32" });
    expect(quitar({ root, dir, platform: "win32" })).toBe("quitado");
    expect(existsSync(path.join(dir, "MaderoSys-Autoinicio.vbs"))).toBe(false);
    expect(instalar({ root, dir, platform: "win32" })).toBe("desactivado");
    expect(existsSync(path.join(dir, "MaderoSys-Autoinicio.vbs"))).toBe(false);

    rmSync(path.join(root, ".sin-inicio-automatico"));
    expect(instalar({ root, dir, platform: "win32" })).toBe("instalado");
  });

  it("fuera de Windows no hace nada (ni en el servidor de Vercel ni en Linux)", () => {
    expect(instalar({ root, dir, platform: "linux" })).toBe("no_windows");
    expect(quitar({ root, dir, platform: "linux" })).toBe("no_windows");
    expect(existsSync(path.join(dir, "MaderoSys-Autoinicio.vbs"))).toBe(false);
    expect(startupDir({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("la carpeta Inicio de Windows se arma desde APPDATA", () => {
    expect(startupDir({ APPDATA: "C:\\Users\\Local\\AppData\\Roaming" } as unknown as NodeJS.ProcessEnv)).toBe(
      "C:\\Users\\Local\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
    );
  });
});

// Un .bat con finales de línea de Linux (LF) puede fallar en Windows con "goto :etiqueta":
// por eso se vigila que sigan en CRLF y que el arranque automático esté conectado.
describe("lanzadores de Windows", () => {
  const read = (f: string) => readFileSync(path.join(process.cwd(), f));
  it.each(["scripts/iniciar-local.bat", "MaderoSys-Iniciar.bat", "MaderoSys-Quitar-Inicio-Automatico.bat"])(
    "%s conserva los finales de línea de Windows",
    (file) => {
      const text = read(file).toString("utf8");
      expect(text).toContain("\r\n");
      expect(text.replace(/\r\n/g, "")).not.toMatch(/\n/);
    }
  );

  it("iniciar-local.bat registra el inicio automático y respeta MADERO_AUTO", () => {
    const text = read("scripts/iniciar-local.bat").toString("utf8");
    expect(text).toContain('node "scripts\\autoinicio.mjs"');
    expect(text).toContain('if "%MADERO_AUTO%"=="1" set "VENTANA_MIN=/min "');
    expect(text).toContain('if "%MADERO_AUTO%"=="1" exit /b 0');
    // el arranque manual sigue igual: abre el navegador
    expect(text).toContain('start "" "http://localhost:3000/admin"');
  });
});
