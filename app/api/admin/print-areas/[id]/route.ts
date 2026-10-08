import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { deletePrintArea, listPrintAreas } from "@/lib/admin/print-areas";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await deletePrintArea(Number(params.id));
  const areas = await listPrintAreas();
  return NextResponse.json({ areas });
}
