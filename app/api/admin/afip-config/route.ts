import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { getAfipConfig, updateAfipConfig } from "@/lib/admin/afip-config";
import type { AfipConfig } from "@/lib/admin/types";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  const config = await getAfipConfig();
  return NextResponse.json({ config });
}

export async function PATCH(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  const body = (await request.json()) as Partial<AfipConfig>;
  const config = await updateAfipConfig({
    cuit: typeof body.cuit === "string" ? body.cuit : undefined,
    puntoVenta: "puntoVenta" in body ? (body.puntoVenta === null ? null : Number(body.puntoVenta)) : undefined,
    condicionIva: typeof body.condicionIva === "string" ? body.condicionIva : undefined,
    habilitado: typeof body.habilitado === "boolean" ? body.habilitado : undefined,
  });
  return NextResponse.json({ config });
}
