import { NextRequest, NextResponse } from "next/server";
import { createReservation } from "@/lib/admin/reservations";
import { isDbConfigured } from "@/lib/admin/db";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "Las reservas online no están disponibles en este momento." },
      { status: 503 }
    );
  }

  const body = await request.json();
  const customerName = String(body.customerName ?? "").trim();
  const customerPhone = String(body.customerPhone ?? "").trim();
  const partySize = Number(body.partySize);
  const date = String(body.date ?? "").trim();
  const time = String(body.time ?? "").trim();
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!customerName || !customerPhone || !date || !time || !partySize || partySize <= 0) {
    return NextResponse.json({ error: "Faltan datos de la reserva" }, { status: 400 });
  }

  try {
    const reservation = await createReservation({ customerName, customerPhone, partySize, date, time, notes });
    return NextResponse.json({ reservation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
