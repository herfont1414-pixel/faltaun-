import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser, recordAudit } from "@/lib/admin/auth";
import { getCurrentShift } from "@/lib/admin/shifts";
import { createCashMovement, listCashMovements } from "@/lib/admin/cash-movements";
import type { CashMovementType } from "@/lib/admin/cash-movements";

const TYPES: CashMovementType[] = ["retiro", "ingreso", "ajuste"];

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ movements: [] });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const shift = await getCurrentShift();
  if (!shift) {
    return NextResponse.json({ movements: [] });
  }
  const movements = await listCashMovements(shift.id);
  return NextResponse.json({ movements });
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const actor = await requireUser(request, ["admin", "encargado"]);
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const shift = await getCurrentShift();
  if (!shift) {
    return NextResponse.json({ error: "No hay un turno de caja abierto" }, { status: 400 });
  }
  const body = await request.json();
  const type = body.type as CashMovementType;
  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: "Tipo de movimiento inválido" }, { status: 400 });
  }
  const amount = Number(body.amount);
  const paymentMethod = body.paymentMethod === "transferencia" ? "transferencia" : "efectivo";
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  try {
    const movement = await createCashMovement({
      shiftId: shift.id,
      type,
      amount,
      paymentMethod,
      note,
      userId: actor.id,
    });
    await recordAudit({
      userId: actor.id,
      action: type === "retiro" ? "withdrawal" : "cash_movement",
      entity: "gestion_cash_movements",
      entityId: movement.id,
      newValue: { type, amount, paymentMethod, note },
    });
    const updatedShift = await getCurrentShift();
    return NextResponse.json({ movement, shift: updatedShift });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
