import { NextResponse } from "next/server";
import { listDeliveryZones } from "@/lib/admin/store";
import { getLocalLocation } from "@/lib/admin/delivery-quote";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";

export const dynamic = "force-dynamic";

// Lectura pública para el menú online. "zones" son las zonas por nombre (como
// siempre); "distance" describe el envío por distancia cuando el local marcó su
// ubicación y cargó zonas con kilómetros.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ zones: [], distance: { enabled: false } });
  }
  await ensureSeeded();
  const [all, origin] = await Promise.all([listDeliveryZones(), getLocalLocation()]);
  const rings = all
    .filter((z) => z.maxKm !== null)
    .map((z) => ({ name: z.name, cost: z.cost, maxKm: z.maxKm as number }));
  const named = all.filter((z) => z.maxKm === null);
  const enabled = !!origin && rings.length > 0;
  return NextResponse.json({
    zones: named,
    distance: enabled
      ? { enabled: true, origin, rings, maxKm: rings[rings.length - 1].maxKm }
      : { enabled: false },
  });
}
