import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { requireUser, recordAudit } from "@/lib/admin/auth";
import { getBusinessConfig, updateBusinessConfig } from "@/lib/admin/business-config";
import type { BusinessConfig } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const config = await getBusinessConfig();
  return NextResponse.json({ config });
}

export async function PATCH(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  const actor = await requireUser(request, ["admin", "encargado"]);
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const before = await getBusinessConfig();
  const body = (await request.json()) as Partial<BusinessConfig>;
  const patch = {
    name: typeof body.name === "string" ? body.name : undefined,
    address: typeof body.address === "string" ? body.address : undefined,
    hours: typeof body.hours === "string" ? body.hours : undefined,
    whatsappNumber: typeof body.whatsappNumber === "string" ? body.whatsappNumber : undefined,
    logoUrl: typeof body.logoUrl === "string" ? body.logoUrl : undefined,
    transferAlias: typeof body.transferAlias === "string" ? body.transferAlias : undefined,
    transferHolder: typeof body.transferHolder === "string" ? body.transferHolder : undefined,
  };
  const config = await updateBusinessConfig(patch);
  await recordAudit({
    userId: actor.id,
    action: "config_change",
    entity: "gestion_business_config",
    oldValue: before,
    newValue: patch,
  });
  return NextResponse.json({ config });
}
