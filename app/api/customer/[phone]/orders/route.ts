import { NextRequest, NextResponse } from "next/server";
import { listWebOrdersByPhone } from "@/lib/admin/web-orders";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { clientIp, LIMITS, rateLimitDistinct, tooManyMessage } from "@/lib/admin/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { phone: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ orders: [] });
  }
  const phone = decodeURIComponent(params.phone).trim();
  if (phone.length < 6) {
    return NextResponse.json({ orders: [] });
  }
  await ensureSeeded();
  // Mismo límite que la tarjeta: frena el barrido de teléfonos ajenos.
  const limit = await rateLimitDistinct("customer_lookup", clientIp(request), phone.replace(/\D/g, "") || phone, LIMITS.customerLookup.max, LIMITS.customerLookup.windowMs);
  if (!limit.ok) return NextResponse.json({ orders: [], error: tooManyMessage(limit.retryAfterSec, "consultas") }, { status: 429 });
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
