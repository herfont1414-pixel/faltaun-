import { NextResponse } from "next/server";
import { getKitchenTickets } from "@/lib/admin/kitchen";
import { isDbConfigured } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ tickets: [] });
  }
  const tickets = await getKitchenTickets();
  return NextResponse.json({ tickets });
}
