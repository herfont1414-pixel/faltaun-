import { NextRequest, NextResponse } from "next/server";
import { searchAddress, reverseAddress } from "@/lib/geocode";
import { getLocalLocation } from "@/lib/admin/delivery-quote";
import { isDbConfigured } from "@/lib/admin/db";
import { isValidLatLng } from "@/lib/geo";

export const dynamic = "force-dynamic";

// Búsqueda pública de direcciones (menú online y panel). Límite simple por IP
// para que nadie use nuestro servidor como puerta a OpenStreetMap.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, number[]>();

function tooMany(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (tooMany(ip)) {
    return NextResponse.json({ error: "Demasiadas búsquedas, esperá unos minutos." }, { status: 429 });
  }
  const params = request.nextUrl.searchParams;
  try {
    if (params.has("lat") || params.has("lng")) {
      const lat = Number(params.get("lat"));
      const lng = Number(params.get("lng"));
      if (!isValidLatLng(lat, lng)) return NextResponse.json({ error: "Ubicación inválida" }, { status: 400 });
      return NextResponse.json({ result: await reverseAddress({ lat, lng }) });
    }
    const q = params.get("q") ?? "";
    const near = isDbConfigured() ? await getLocalLocation().catch(() => null) : null;
    return NextResponse.json({ results: await searchAddress(q, near) });
  } catch {
    return NextResponse.json(
      { error: "No pudimos buscar la dirección ahora. Marcala tocando el mapa." },
      { status: 502 }
    );
  }
}
