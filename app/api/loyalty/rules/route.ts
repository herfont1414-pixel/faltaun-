import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { listRewards } from "@/lib/admin/loyalty";

export const dynamic = "force-dynamic";

// Reglas públicas de la tarjeta (qué premio se gana en cada hito). Sin datos de clientes.
export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ rewards: [] });
  try {
    await ensureSeeded();
    const rewards = (await listRewards())
      .filter((r) => r.active)
      .map((r) => ({
        code: r.code,
        name: r.name,
        description: r.description,
        firstMilestone: r.firstMilestone,
        step: r.step,
      }));
    return NextResponse.json({ rewards });
  } catch {
    return NextResponse.json({ rewards: [] });
  }
}
