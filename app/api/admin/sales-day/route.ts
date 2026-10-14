import { NextRequest, NextResponse } from "next/server";
import { getSalesDay, jornadaKey } from "@/lib/admin/sales-day";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

// Ventas de una jornada (6:00 a 6:00). ?date=AAAA-MM-DD; sin fecha, la jornada actual.
export async function GET(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ day: null });
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const date = request.nextUrl.searchParams.get("date") || jornadaKey();
  try {
    return NextResponse.json({ day: await getSalesDay(date) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
