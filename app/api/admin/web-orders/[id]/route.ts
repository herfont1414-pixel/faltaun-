import { NextRequest, NextResponse } from "next/server";
import { respondWebOrder } from "@/lib/admin/web-orders";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { ensureSeeded } from "@/lib/admin/seed";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { status, etaMinutes } = await request.json();
  try {
    // Aceptar suma el sello y el premio en la misma transacción: se asegura que las tablas
    // de fidelidad existan (igual que el resto de las rutas del panel).
    await ensureSeeded();
    const { orderId } = await respondWebOrder(params.id, status, etaMinutes ?? null);
    return NextResponse.json({ ok: true, orderId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
