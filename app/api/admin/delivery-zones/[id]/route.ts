import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { deleteDeliveryZone, listDeliveryZones } from "@/lib/admin/store";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await deleteDeliveryZone(Number(params.id));
  const zones = await listDeliveryZones();
  return NextResponse.json({ zones });
}
