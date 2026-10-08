import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { listCrmCustomers } from "@/lib/admin/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ customers: [] });
  }
  const customers = await listCrmCustomers();
  return NextResponse.json({ customers });
}
