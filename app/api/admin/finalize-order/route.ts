import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { finalizeOrder } from "@/lib/admin/store";
import { addStamp } from "@/lib/admin/loyalty";
import { recordAudit } from "@/lib/admin/auth";
import type { OrderPayment } from "@/lib/admin/types";

export async function POST(request: NextRequest) {
  const { orderId, payments, customerId, loyaltyPhone } = (await request.json()) as {
    orderId: string;
    payments: OrderPayment[];
    customerId: number | null;
    loyaltyPhone?: string | null;
  };
  return ok(request, async (actor) => {
    const result = await finalizeOrder(orderId, payments, customerId ?? null, actor.id);
    if (loyaltyPhone) await addStamp(loyaltyPhone, orderId, { orderTotal: result.total, origin: result.origin });
    await recordAudit({
      userId: actor.id,
      action: "order_close",
      entity: "gestion_orders",
      entityId: orderId,
      newValue: { total: result.total, origin: result.origin, payments: result.payments },
    });
    return result;
  });
}
