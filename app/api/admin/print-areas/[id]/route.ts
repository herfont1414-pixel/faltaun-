import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { deletePrintArea, listPrintAreas, setPrintAreaEnComanda } from "@/lib/admin/print-areas";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  await deletePrintArea(Number(params.id));
  const areas = await listPrintAreas();
  return NextResponse.json({ areas });
}

// { enComanda: boolean }: si lo de esta área sale o no en la comanda de cocina.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { enComanda?: unknown } | null;
  if (typeof body?.enComanda !== "boolean") {
    return NextResponse.json({ error: "Falta indicar si sale en la comanda" }, { status: 400 });
  }
  await setPrintAreaEnComanda(Number(params.id), body.enComanda);
  return NextResponse.json({ areas: await listPrintAreas() });
}
