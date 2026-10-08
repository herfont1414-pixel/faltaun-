import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { sendRawToPrinter } from "@/lib/admin/print-direct";
import { renderTicketEscPos, renderComandaEscPos } from "@/lib/admin/escpos";
import type { PrintConfig } from "@/lib/admin/types";
import type { TicketPrintData, ComandaPrintData } from "@/lib/admin/print-templates";

let dbPath: string;

beforeAll(async () => {
  dbPath = await seedFreshDb("print");
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

async function setPrintConfig(enabled: boolean, printerName: string) {
  await getPool().query("update gestion_print_config set direct_print_enabled = $1, printer_name = $2 where id = 1", [
    enabled,
    printerName,
  ]);
}

// Simula Windows lo justo para ejecutar sendRawToPrinter: plataforma win32 y un
// "powershell.exe" falso en el PATH que registra los argumentos que recibe.
async function withFakeWindows<T>(mode: "ok" | "fail", fn: (logPath: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fake-ps-"));
  const logPath = path.join(dir, "args.log");
  const script = path.join(dir, "powershell.exe");
  writeFileSync(
    script,
    `#!/bin/bash
{ printf 'ARGS:'; for a in "$@"; do printf ' [%s]' "$a"; done; echo; } >> "${logPath}"
if [ "${mode}" = "fail" ]; then echo "No se pudo imprimir en 'X' (codigo de error de Windows: 1801)" >&2; exit 1; fi
echo OK
`
  );
  chmodSync(script, 0o755);

  const realPlatform = process.platform;
  const realPath = process.env.PATH;
  const realTemp = process.env.TEMP;
  Object.defineProperty(process, "platform", { value: "win32" });
  process.env.PATH = `${dir}:${realPath}`;
  process.env.TEMP = os.tmpdir();
  try {
    return await fn(logPath);
  } finally {
    Object.defineProperty(process, "platform", { value: realPlatform });
    process.env.PATH = realPath;
    if (realTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = realTemp;
  }
}

describe("impresión directa: sendRawToPrinter", () => {
  it("recorta espacios del nombre de la impresora antes de llamar a PowerShell", async () => {
    await setPrintConfig(true, "  POS-58-Series  ");
    const result = await withFakeWindows("ok", async (logPath) => {
      const r = await sendRawToPrinter(Buffer.from([0x1b, 0x40]));
      return { r, log: readFileSync(logPath, "utf8") };
    });
    expect(result.r.ok).toBe(true);
    expect(result.log).toContain("[-PrinterName] [POS-58-Series] [-FilePath]");
  });

  it("si PowerShell falla devuelve print_failed con el detalle de Windows", async () => {
    await setPrintConfig(true, "POS-58-Series");
    const r = await withFakeWindows("fail", () => sendRawToPrinter(Buffer.from([0x1b, 0x40])));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("print_failed");
    expect(r.detail).toContain("1801");
  });

  it("desactivada o sin nombre: not_configured", async () => {
    await setPrintConfig(false, "POS-58-Series");
    expect((await sendRawToPrinter(Buffer.from([0x1b, 0x40]))).reason).toBe("not_configured");
    await setPrintConfig(true, "   ");
    expect((await sendRawToPrinter(Buffer.from([0x1b, 0x40]))).reason).toBe("not_configured");
  });

  it("fuera de Windows (como el servidor de Vercel): unsupported_platform", async () => {
    await setPrintConfig(true, "POS-58-Series");
    const r = await sendRawToPrinter(Buffer.from([0x1b, 0x40]));
    expect(r.reason).toBe("unsupported_platform");
  });
});

const config58: PrintConfig = {
  paperWidthMm: 58,
  headerText: "Madero Resto",
  footerText: "Gracias por tu visita",
  paperSavingMode: false,
  fontSizeHeader: "normal",
  fontSizeBody: "normal",
  fontSizeFooter: "normal",
  directPrintEnabled: true,
  printerName: "POS-58-Series",
};

// Quita los comandos ESC/POS (init, alineación, negrita, tamaño, avance, corte)
// para quedarse solo con el texto impreso.
function printedLines(buffer: Buffer): string[] {
  const text = buffer
    .toString("latin1")
    .replace(/\x1b@/g, "")
    .replace(/\x1b[aEd][\x00-\x09]/g, "")
    .replace(/\x1d[!V][\x00-\xff]/g, "");
  return text.split("\n");
}

describe("ESC/POS a 58 mm", () => {
  const ticket: TicketPrintData = {
    orderId: "c70be462-aaaa-bbbb-cccc-000000000000",
    tableNumber: 1,
    origin: "mesa",
    isDelivery: false,
    status: "cerrada",
    customerName: "pepe",
    customerPhone: null,
    customerAddress: null,
    openedAt: "2026-10-08T20:45:00Z",
    items: [
      { name: "Papas Chedar Con Bacon Y Salsa Especial De La Casa", qty: 1, price: 8500, note: null },
      { name: "Papas Chedar", qty: 2, price: 8000, note: "sin sal" },
    ],
    shippingCost: 0,
    total: 24500,
    paymentMethod: null,
    payments: [
      { method: "efectivo", amount: 10000 },
      { method: "transferencia", amount: 14500 },
    ],
  };

  it("el ticket empieza con ESC @ y ninguna línea supera las 32 columnas", () => {
    const buf = renderTicketEscPos(ticket, config58);
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
    const lines = printedLines(buf);
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(32);
  });

  it("la comanda tampoco supera las 32 columnas", () => {
    const comanda: ComandaPrintData = {
      orderId: ticket.orderId,
      tableNumber: 1,
      origin: "mesa",
      customerName: "pepe",
      partySize: 2,
      openedAt: ticket.openedAt,
      notes: "alergia a mani en la mesa",
      areas: [{ name: "Cocina", items: [{ name: "Papas Chedar Con Bacon Y Salsa Especial", qty: 1, note: "bien cocidas" }] }],
    };
    const lines = printedLines(renderComandaEscPos(comanda, config58));
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(32);
  });
});
