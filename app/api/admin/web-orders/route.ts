import { NextRequest, NextResponse } from "next/server";
import { listWebOrders } from "@/lib/admin/web-orders";
import { isDbConfigured } from "@/lib/admin/db";
import type { WebOrderStatus } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ orders: [] });
  }
  const status = request.nextUrl.searchParams.get("status") as WebOrderStatus | null;
  const orders = await listWebOrders(status ?? undefined);
  return NextResponse.json({ orders });
}
