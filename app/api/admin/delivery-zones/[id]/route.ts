import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { deleteDeliveryZone, listDeliveryZones } from "@/lib/admin/store";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  await deleteDeliveryZone(Number(params.id));
  const zones = await listDeliveryZones();
  return NextResponse.json({ zones });
}
