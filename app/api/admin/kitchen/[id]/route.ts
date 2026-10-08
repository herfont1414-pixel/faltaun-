import { NextRequest, NextResponse } from "next/server";
import { setKitchenStatus } from "@/lib/admin/kitchen";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import type { KitchenSource, KitchenStatus } from "@/lib/admin/types";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { source, status } = (await request.json()) as { source: KitchenSource; status: KitchenStatus };
  await setKitchenStatus(params.id, source, status);
  return NextResponse.json({ ok: true });
}
