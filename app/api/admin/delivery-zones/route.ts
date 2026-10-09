import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { listDeliveryZones, upsertDeliveryZone } from "@/lib/admin/store";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const zones = await listDeliveryZones();
  return NextResponse.json({ zones });
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { name, cost, maxKm } = (await request.json()) as { name: string; cost: number; maxKm?: number | null };
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Falta el nombre de la zona" }, { status: 400 });
  }
  try {
    await upsertDeliveryZone(name.trim(), cost ?? 0, maxKm ? Number(maxKm) : null);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
  const zones = await listDeliveryZones();
  return NextResponse.json({ zones });
}
