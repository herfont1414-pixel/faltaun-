import { NextRequest, NextResponse } from "next/server";
import { getCurrentShift, listRecentShifts } from "@/lib/admin/shifts";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ shift: null, history: [] });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const [shift, history] = await Promise.all([getCurrentShift(), listRecentShifts(10)]);
  return NextResponse.json({ shift, history });
}
