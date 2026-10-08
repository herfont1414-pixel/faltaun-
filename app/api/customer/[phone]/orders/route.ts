import { NextRequest, NextResponse } from "next/server";
import { listWebOrdersByPhone } from "@/lib/admin/web-orders";
import { isDbConfigured } from "@/lib/admin/db";

export async function GET(_request: NextRequest, { params }: { params: { phone: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ orders: [] });
  }
  const phone = decodeURIComponent(params.phone).trim();
  if (phone.length < 6) {
    return NextResponse.json({ orders: [] });
  }
  const orders = await listWebOrdersByPhone(phone);
  return NextResponse.json({ orders });
}
