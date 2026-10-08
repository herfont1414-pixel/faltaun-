import { NextResponse } from "next/server";
import { listDeliveryZones } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ zones: [] });
  }
  const zones = await listDeliveryZones();
  return NextResponse.json({ zones });
}
