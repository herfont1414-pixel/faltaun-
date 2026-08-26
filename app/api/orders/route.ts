import { NextRequest, NextResponse } from "next/server";
import { createWebOrder } from "@/lib/admin/web-orders";
import { isDbConfigured } from "@/lib/admin/db";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "El pedido online no está disponible en este momento." }, { status: 503 });
  }

  const body = await request.json();
  const customerName = String(body.customerName ?? "").trim();
  const customerPhone = String(body.customerPhone ?? "").trim();
  const notes = body.notes ? String(body.notes).trim() : null;
  const items = Array.isArray(body.items) ? body.items : [];

  if (!customerName || !customerPhone) {
    return NextResponse.json({ error: "Faltan tu nombre y tu WhatsApp" }, { status: 400 });
  }

  try {
    const order = await createWebOrder({ customerName, customerPhone, notes, items });
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
