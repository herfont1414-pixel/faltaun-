import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { getDashboardSummary } from "@/lib/admin/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ summary: null });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const summary = await getDashboardSummary();
  return NextResponse.json({ summary });
}
