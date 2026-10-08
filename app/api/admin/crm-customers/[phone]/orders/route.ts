import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { listWebOrdersByPhone } from "@/lib/admin/web-orders";

export async function GET(_request: NextRequest, { params }: { params: { phone: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ orders: [] });
  }
  const orders = await listWebOrdersByPhone(decodeURIComponent(params.phone));
  return NextResponse.json({ orders });
}
