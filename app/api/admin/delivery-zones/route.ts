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
  const { name, cost } = (await request.json()) as { name: string; cost: number };
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Falta el nombre de la zona" }, { status: 400 });
  }
  await upsertDeliveryZone(name.trim(), cost ?? 0);
  const zones = await listDeliveryZones();
  return NextResponse.json({ zones });
}
