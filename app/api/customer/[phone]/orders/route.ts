import { NextRequest, NextResponse } from "next/server";
import { listWebOrdersByPhone } from "@/lib/admin/web-orders";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { phone: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ orders: [] });
  }
  const phone = decodeURIComponent(params.phone).trim();
  if (phone.length < 6) {
    return NextResponse.json({ orders: [] });
  }
  await ensureSeeded();
  const orders = await listWebOrdersByPhone(phone);
  // Solo lo que el cliente necesita ver de su pedido (sin dirección ni ubicación).
  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      items: o.items,
      total: o.total,
      status: o.status,
      progress: o.progress,
      fulfillment: o.fulfillment,
      etaMinutes: o.etaMinutes,
      createdAt: o.createdAt,
    })),
  });
}
