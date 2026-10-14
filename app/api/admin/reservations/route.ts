import { NextRequest, NextResponse } from "next/server";
import { createPanelReservation, listReservations, listUpcomingReservations } from "@/lib/admin/reservations";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { requireUser } from "@/lib/admin/auth";
import type { ReservationStatus } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ reservations: [] });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  await ensureSeeded();
  if (request.nextUrl.searchParams.get("scope") === "upcoming") {
    return NextResponse.json({ reservations: await listUpcomingReservations() });
  }
  const status = request.nextUrl.searchParams.get("status") as ReservationStatus | null;
  const reservations = await listReservations(status ?? undefined);
  return NextResponse.json({ reservations });
}

// Reserva cargada por el personal (por teléfono, en el local…): queda confirmada.
export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const user = await requireUser(request, ["admin", "encargado", "mozo"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  await ensureSeeded();
  const body = await request.json().catch(() => ({}));
  try {
    const reservation = await createPanelReservation(
      {
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        partySize: Number(body.partySize),
        date: body.date,
        time: body.time,
        tableNumber: body.tableNumber === "" || body.tableNumber === undefined ? null : body.tableNumber,
        notes: body.notes,
      },
      user.id
    );
    return NextResponse.json({ reservation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la reserva" }, { status: 400 });
  }
}
