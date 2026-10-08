import { NextRequest, NextResponse } from "next/server";
import { respondReservation } from "@/lib/admin/reservations";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { status } = await request.json();
  await respondReservation(params.id, status);
  return NextResponse.json({ ok: true });
}
