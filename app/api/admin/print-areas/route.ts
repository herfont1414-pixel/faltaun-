import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { createPrintArea, listPrintAreas } from "@/lib/admin/print-areas";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ areas: [] });
  }
  const areas = await listPrintAreas();
  return NextResponse.json({ areas });
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const { nombre } = (await request.json()) as { nombre: string };
  if (!nombre || !nombre.trim()) {
    return NextResponse.json({ error: "Falta el nombre del área" }, { status: 400 });
  }
  await createPrintArea(nombre.trim());
  const areas = await listPrintAreas();
  return NextResponse.json({ areas });
}
