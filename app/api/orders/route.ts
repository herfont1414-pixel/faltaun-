import { NextRequest, NextResponse } from "next/server";
import { createWebOrder } from "@/lib/admin/web-orders";
import { isDbConfigured } from "@/lib/admin/db";
import type { Fulfillment } from "@/lib/admin/types";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "El pedido online no está disponible en este momento." }, { status: 503 });
  }

  const body = await request.json();
  const customerName = String(body.customerName ?? "").trim();
  const customerPhone = String(body.customerPhone ?? "").trim();
  const notes = body.notes ? String(body.notes).trim() : null;
  const items = Array.isArray(body.items) ? body.items : [];
  const fulfillment: Fulfillment = body.fulfillment === "delivery" ? "delivery" : "retiro";
  const customerAddress = body.customerAddress ? String(body.customerAddress).trim() : null;
  const deliveryZone = body.deliveryZone ? String(body.deliveryZone).trim() : null;
  const paymentMethod = body.paymentMethod === "efectivo" || body.paymentMethod === "transferencia" ? body.paymentMethod : null;
  const deliveryLat = typeof body.deliveryLat === "number" ? body.deliveryLat : null;
  const deliveryLng = typeof body.deliveryLng === "number" ? body.deliveryLng : null;

  if (!customerName || !customerPhone) {
    return NextResponse.json({ error: "Faltan tu nombre y tu WhatsApp" }, { status: 400 });
  }
  if (fulfillment === "delivery" && !customerAddress) {
    return NextResponse.json({ error: "Falta la dirección de entrega" }, { status: 400 });
  }

  try {
    const order = await createWebOrder({
      customerName,
      customerPhone,
      notes,
      items,
      fulfillment,
      customerAddress: fulfillment === "delivery" ? customerAddress : null,
      deliveryZone: fulfillment === "delivery" ? deliveryZone : null,
      paymentMethod,
      deliveryLat: fulfillment === "delivery" ? deliveryLat : null,
      deliveryLng: fulfillment === "delivery" ? deliveryLng : null,
    });
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
