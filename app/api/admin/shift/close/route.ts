import { NextRequest, NextResponse } from "next/server";
import { closeShift } from "@/lib/admin/shifts";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser, recordAudit } from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const actor = await requireUser(request);
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const countedCash = typeof body.countedCash === "number" ? body.countedCash : 0;
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    const shift = await closeShift(countedCash, notes);
    await recordAudit({
      userId: actor.id,
      action: "shift_close",
      entity: "gestion_shifts",
      entityId: shift.id,
      newValue: { countedCash, expectedCash: shift.expectedCash, difference: shift.difference },
    });
    return NextResponse.json({ shift });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
