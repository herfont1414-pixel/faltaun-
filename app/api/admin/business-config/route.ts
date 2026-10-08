import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { getBusinessConfig, updateBusinessConfig } from "@/lib/admin/business-config";
import type { BusinessConfig } from "@/lib/admin/types";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  const config = await getBusinessConfig();
  return NextResponse.json({ config });
}

export async function PATCH(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  const body = (await request.json()) as Partial<BusinessConfig>;
  const config = await updateBusinessConfig({
    name: typeof body.name === "string" ? body.name : undefined,
    address: typeof body.address === "string" ? body.address : undefined,
    hours: typeof body.hours === "string" ? body.hours : undefined,
    whatsappNumber: typeof body.whatsappNumber === "string" ? body.whatsappNumber : undefined,
  });
  return NextResponse.json({ config });
}
