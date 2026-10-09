import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { ensureSeeded } from "@/lib/admin/seed";
import { getLocalLocation, setLocalLocation } from "@/lib/admin/delivery-quote";
import { getBusinessConfig } from "@/lib/admin/business-config";
import { isValidLatLng } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  if (!(await requireUser(request))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  await ensureSeeded();
  const [location, config] = await Promise.all([getLocalLocation(), getBusinessConfig()]);
  return NextResponse.json({ location, address: config.address });
}

export async function PUT(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { lat, lng } = (await request.json()) as { lat: number; lng: number };
  if (!isValidLatLng(lat, lng)) return NextResponse.json({ error: "Ubicación inválida" }, { status: 400 });
  await setLocalLocation({ lat, lng });
  return NextResponse.json({ location: { lat, lng } });
}
