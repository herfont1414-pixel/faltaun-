import { NextRequest, NextResponse } from "next/server";
import { searchCustomers } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ customers: [] });
  }
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const customers = await searchCustomers(query);
  return NextResponse.json({ customers });
}
