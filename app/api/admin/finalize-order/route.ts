import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { finalizeOrder } from "@/lib/admin/store";
import { addStamp } from "@/lib/admin/loyalty";
import type { OrderPayment } from "@/lib/admin/types";

export async function POST(request: NextRequest) {
  const { orderId, payments, customerId, loyaltyPhone } = (await request.json()) as {
    orderId: string;
    payments: OrderPayment[];
    customerId: number | null;
    loyaltyPhone?: string | null;
  };
  return ok(request, async () => {
    const result = await finalizeOrder(orderId, payments, customerId ?? null);
    if (loyaltyPhone) await addStamp(loyaltyPhone, { orderTotal: result.total, origin: result.origin });
    return result;
  });
}
