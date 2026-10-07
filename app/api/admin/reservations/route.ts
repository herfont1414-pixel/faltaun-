import { NextRequest, NextResponse } from "next/server";
import { listReservations } from "@/lib/admin/reservations";
import { isDbConfigured } from "@/lib/admin/db";
import type { ReservationStatus } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ reservations: [] });
  }
  const status = request.nextUrl.searchParams.get("status") as ReservationStatus | null;
  const reservations = await listReservations(status ?? undefined);
  return NextResponse.json({ reservations });
}
