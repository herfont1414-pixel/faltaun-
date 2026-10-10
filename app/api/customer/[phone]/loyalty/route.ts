import { NextRequest, NextResponse } from "next/server";
import { getLoyalty, listGrantsForPhone, listRewards } from "@/lib/admin/loyalty";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";

export const dynamic = "force-dynamic";

// Tarjeta pública del cliente: sellos, reglas de premios y sus premios (pendientes y
// ya entregados). Solo datos propios de la tarjeta: sin ids internos ni datos del empleado.
export async function GET(_request: NextRequest, { params }: { params: { phone: string } }) {
  const empty = { account: null, rewards: [], grants: [] };
  if (!isDbConfigured()) return NextResponse.json(empty);
  const phone = decodeURIComponent(params.phone).trim();
  if (phone.length < 6) return NextResponse.json(empty);

  await ensureSeeded();
  const [account, rewards, grants] = await Promise.all([getLoyalty(phone), listRewards(), listGrantsForPhone(phone)]);
  return NextResponse.json({
    account,
    rewards: rewards
      .filter((r) => r.active)
      .map((r) => ({ code: r.code, name: r.name, description: r.description, firstMilestone: r.firstMilestone, step: r.step })),
    grants: grants.map((g) => ({
      rewardCode: g.rewardCode,
      rewardName: g.rewardName,
      rewardDescription: g.rewardDescription,
      milestone: g.milestone,
      status: g.status,
      createdAt: g.createdAt,
      redeemedAt: g.redeemedAt,
    })),
  });
}
