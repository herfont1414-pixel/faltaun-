import { NextRequest, NextResponse } from "next/server";
import { assignReservationTable, respondReservation } from "@/lib/admin/reservations";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

const STATUSES = ["pendiente", "confirmada", "rechazada"] as const;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    // Asignar o quitar mesa (con control de que no choque con otra reserva).
    if ("tableNumber" in body) {
      const table = body.tableNumber === null || body.tableNumber === "" ? null : Number(body.tableNumber);
      await assignReservationTable(params.id, table);
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new Error("Estado inválido");
      await respondReservation(params.id, body.status);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
