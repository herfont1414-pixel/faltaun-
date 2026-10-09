import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { quoteDelivery } from "@/lib/admin/delivery-quote";
import { isValidLatLng } from "@/lib/geo";

export const dynamic = "force-dynamic";

// Vista previa del envío para el menú online. El precio que realmente se cobra
// se vuelve a calcular en el servidor al crear el pedido.
export async function GET(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ status: "unavailable" });
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!isValidLatLng(lat, lng)) {
    return NextResponse.json({ error: "Ubicación inválida" }, { status: 400 });
  }
  await ensureSeeded();
  const quote = await quoteDelivery({ lat, lng });
  if (quote.status === "ok") {
    return NextResponse.json({
      status: "ok",
      km: Math.round(quote.km * 10) / 10,
      zoneName: quote.zone.name,
      cost: quote.zone.cost,
    });
  }
  if (quote.status === "out_of_range") {
    return NextResponse.json({ status: "out_of_range", km: Math.round(quote.km * 10) / 10, maxKm: quote.maxKm });
  }
  return NextResponse.json({ status: "unavailable" });
}
