import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { finalizeOrder } from "@/lib/admin/store";
import { addStamp } from "@/lib/admin/loyalty";
import type { PaymentMethod } from "@/lib/admin/types";

export async function POST(request: NextRequest) {
  const { orderId, paymentMethod, customerId, loyaltyPhone } = (await request.json()) as {
    orderId: string;
    paymentMethod: PaymentMethod;
    customerId: number | null;
    loyaltyPhone?: string | null;
  };
  return ok(async () => {
    const result = await finalizeOrder(orderId, paymentMethod, customerId ?? null);
    if (loyaltyPhone) await addStamp(loyaltyPhone);
    return result;
  });
}
