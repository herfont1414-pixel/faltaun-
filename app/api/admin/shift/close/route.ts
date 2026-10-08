import { NextRequest, NextResponse } from "next/server";
import { closeShift } from "@/lib/admin/shifts";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const countedCash = typeof body.countedCash === "number" ? body.countedCash : 0;
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    const shift = await closeShift(countedCash, notes);
    return NextResponse.json({ shift });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
