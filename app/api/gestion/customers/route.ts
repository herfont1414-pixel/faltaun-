import { NextRequest, NextResponse } from "next/server";
import { searchCustomers } from "@/lib/gestion/store";
import { isDbConfigured } from "@/lib/gestion/db";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ customers: [] });
  }
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const customers = await searchCustomers(query);
  return NextResponse.json({ customers });
}
