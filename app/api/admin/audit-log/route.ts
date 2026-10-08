import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { listAuditLog } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ entries: [] });
  }
  if (!(await requireUser(request, ["admin"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const entries = await listAuditLog(200);
  return NextResponse.json({ entries });
}
