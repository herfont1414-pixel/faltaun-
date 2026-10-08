import { NextRequest, NextResponse } from "next/server";
import { listReservations } from "@/lib/admin/reservations";
import { isDbConfigured } from "@/lib/admin/db";
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
  const status = request.nextUrl.searchParams.get("status") as ReservationStatus | null;
  const reservations = await listReservations(status ?? undefined);
  return NextResponse.json({ reservations });
}
