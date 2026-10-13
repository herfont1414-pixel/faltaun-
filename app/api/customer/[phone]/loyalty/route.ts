import { NextRequest, NextResponse } from "next/server";
import { getLoyalty, listGrantsForPhone, listRewards } from "@/lib/admin/loyalty";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { clientIp, LIMITS, rateLimitDistinct, tooManyMessage } from "@/lib/admin/rate-limit";

export const dynamic = "force-dynamic";

// Tarjeta pública del cliente: sellos, reglas de premios y sus premios (pendientes y
// ya entregados). Cualquiera puede escribir un teléfono, así que NO devuelve datos
// personales (nombre, teléfono guardado, cantidad de pedidos ni gasto), ni ids internos
// ni datos del empleado. Con límite de consultas para que no se barran números.
export async function GET(request: NextRequest, { params }: { params: { phone: string } }) {
  const empty = { account: null, rewards: [], grants: [] };
  if (!isDbConfigured()) return NextResponse.json(empty);
  const phone = decodeURIComponent(params.phone).trim();
  if (phone.length < 6) return NextResponse.json(empty);

  await ensureSeeded();
  const limit = await rateLimitDistinct("customer_lookup", clientIp(request), phone.replace(/\D/g, "") || phone, LIMITS.customerLookup.max, LIMITS.customerLookup.windowMs);
  if (!limit.ok) return NextResponse.json({ ...empty, error: tooManyMessage(limit.retryAfterSec, "consultas") }, { status: 429 });

  const [loyalty, rewards, grants] = await Promise.all([getLoyalty(phone), listRewards(), listGrantsForPhone(phone)]);
  return NextResponse.json({
    account: {
      stamps: loyalty.stamps,
      redeemed: loyalty.redeemed,
      rewardsAvailable: loyalty.rewardsAvailable,
      stampsToNextReward: loyalty.stampsToNextReward,
    },
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
