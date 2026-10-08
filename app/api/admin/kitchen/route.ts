import { NextRequest, NextResponse } from "next/server";
import { getKitchenTickets } from "@/lib/admin/kitchen";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ tickets: [] });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tickets = await getKitchenTickets();
  return NextResponse.json({ tickets });
}
