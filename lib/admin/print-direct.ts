// Manda un buffer ESC/POS crudo a una impresora de Windows instalada
// localmente, usando el script scripts/print-raw.ps1 (API WritePrinter de
// Windows). Esto SOLO puede funcionar cuando el proceso de Next.js corre
// en la misma PC que tiene la impresora conectada por USB — es decir, la
// instancia local que arranca start-local.bat, nunca en el deploy de
// Vercel (sus servidores no tienen forma de llegar a un USB físico en el
// local). Por eso chequea process.platform antes de intentar nada: en
// cualquier entorno que no sea Windows, directamente no lo intenta.
import { spawn } from "node:child_process";
import { mkdtemp, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getPrintConfig } from "@/lib/admin/print-config";

export interface DirectPrintResult {
  ok: boolean;
  reason?: "not_configured" | "unsupported_platform" | "print_failed";
  detail?: string;
}

export async function sendRawToPrinter(buffer: Buffer): Promise<DirectPrintResult> {
  const config = await getPrintConfig();
  if (!config.directPrintEnabled || !config.printerName.trim()) {
    return { ok: false, reason: "not_configured" };
  }
  if (process.platform !== "win32") {
    return { ok: false, reason: "unsupported_platform" };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "maderosys-print-"));
  const filePath = path.join(dir, "ticket.bin");
  await writeFile(filePath, buffer);
  const scriptPath = path.join(process.cwd(), "scripts", "print-raw.ps1");

  try {
    const detail = await new Promise<string>((resolve, reject) => {
      const proc = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-PrinterName",
          config.printerName.trim(),
          "-FilePath",
          filePath,
        ],
        { windowsHide: true }
      );
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
      proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr.trim() || `powershell salió con código ${code}`));
      });
    });
    return { ok: true, detail };
  } catch (error) {
    return { ok: false, reason: "print_failed", detail: error instanceof Error ? error.message : String(error) };
  } finally {
    await unlink(filePath).catch(() => {});
  }
}
