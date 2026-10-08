import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { getBusinessConfig } from "@/lib/admin/business-config";

export const dynamic = "force-dynamic";

// Lectura pública (sin auth de admin): el menú y el checkout la usan para
// armar el link de WhatsApp del negocio sin depender de una variable de
// entorno fija.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ config: { name: "", address: "", hours: "", whatsappNumber: "" } });
  }
  await ensureSeeded();
  const config = await getBusinessConfig();
  return NextResponse.json({ config });
}
