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
    return NextResponse.json({ config: { name: "", address: "", hours: "", whatsappNumber: "", transferAlias: "", transferHolder: "" } });
  }
  await ensureSeeded();
  const config = await getBusinessConfig();
  // Solo lo que el menú online necesita mostrar (el alias es información pública para transferir).
  return NextResponse.json({
    config: {
      name: config.name,
      address: config.address,
      hours: config.hours,
      whatsappNumber: config.whatsappNumber,
      transferAlias: config.transferAlias,
      transferHolder: config.transferHolder,
    },
  });
}
