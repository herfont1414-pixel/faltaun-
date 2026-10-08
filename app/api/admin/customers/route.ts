import { NextRequest, NextResponse } from "next/server";
import { searchCustomers } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ customers: [] });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const customers = await searchCustomers(query);
  return NextResponse.json({ customers });
}
