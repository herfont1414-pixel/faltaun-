import { NextRequest, NextResponse } from "next/server";
import { getState } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ notConfigured: true });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const state = await getState();
  return NextResponse.json(state);
}
