import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { getPrintConfig, updatePrintConfig } from "@/lib/admin/print-config";
import type { PrintConfig } from "@/lib/admin/types";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  const config = await getPrintConfig();
  return NextResponse.json({ config });
}

export async function PATCH(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  const body = (await request.json()) as Partial<PrintConfig>;
  const config = await updatePrintConfig({
    paperWidthMm: body.paperWidthMm === 58 ? 58 : body.paperWidthMm === 80 ? 80 : undefined,
    headerText: typeof body.headerText === "string" ? body.headerText : undefined,
    footerText: typeof body.footerText === "string" ? body.footerText : undefined,
    paperSavingMode: typeof body.paperSavingMode === "boolean" ? body.paperSavingMode : undefined,
    fontSizeHeader: body.fontSizeHeader === "pequena" || body.fontSizeHeader === "normal" ? body.fontSizeHeader : undefined,
    fontSizeBody: body.fontSizeBody === "pequena" || body.fontSizeBody === "normal" ? body.fontSizeBody : undefined,
    fontSizeFooter: body.fontSizeFooter === "pequena" || body.fontSizeFooter === "normal" ? body.fontSizeFooter : undefined,
    directPrintEnabled: typeof body.directPrintEnabled === "boolean" ? body.directPrintEnabled : undefined,
    printerName: typeof body.printerName === "string" ? body.printerName : undefined,
  });
  return NextResponse.json({ config });
}
