import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { requireUser, recordAudit } from "@/lib/admin/auth";
import { getAfipConfig, updateAfipConfig } from "@/lib/admin/afip-config";
import type { AfipConfig } from "@/lib/admin/types";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const config = await getAfipConfig();
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
  const before = await getAfipConfig();
  const body = (await request.json()) as Partial<AfipConfig>;
  const patch = {
    cuit: typeof body.cuit === "string" ? body.cuit : undefined,
    puntoVenta: "puntoVenta" in body ? (body.puntoVenta === null ? null : Number(body.puntoVenta)) : undefined,
    condicionIva: typeof body.condicionIva === "string" ? body.condicionIva : undefined,
    habilitado: typeof body.habilitado === "boolean" ? body.habilitado : undefined,
  };
  const config = await updateAfipConfig(patch);
  await recordAudit({
    userId: actor.id,
    action: "config_change",
    entity: "gestion_afip_config",
    oldValue: before,
    newValue: patch,
  });
  return NextResponse.json({ config });
}
