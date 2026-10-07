import { NextRequest, NextResponse } from "next/server";
import { respondReservation } from "@/lib/admin/reservations";
import { isDbConfigured } from "@/lib/admin/db";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const { status } = await request.json();
  await respondReservation(params.id, status);
  return NextResponse.json({ ok: true });
}
