import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { listWebOrdersByPhone } from "@/lib/admin/web-orders";

export async function GET(request: NextRequest, { params }: { params: { phone: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ orders: [] });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const orders = await listWebOrdersByPhone(decodeURIComponent(params.phone));
  return NextResponse.json({ orders });
}
