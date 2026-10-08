import { NextRequest, NextResponse } from "next/server";
import { respondWebOrder } from "@/lib/admin/web-orders";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { status, etaMinutes } = await request.json();
  await respondWebOrder(params.id, status, etaMinutes ?? null);
  return NextResponse.json({ ok: true });
}
