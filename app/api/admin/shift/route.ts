import { NextResponse } from "next/server";
import { getCurrentShift, listRecentShifts } from "@/lib/admin/shifts";
import { isDbConfigured } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ shift: null, history: [] });
  }
  const [shift, history] = await Promise.all([getCurrentShift(), listRecentShifts(10)]);
  return NextResponse.json({ shift, history });
}
