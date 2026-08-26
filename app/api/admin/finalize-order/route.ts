import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { finalizeOrder } from "@/lib/admin/store";
import type { PaymentMethod } from "@/lib/admin/types";

export async function POST(request: NextRequest) {
  const { orderId, paymentMethod, customerId } = (await request.json()) as {
    orderId: string;
    paymentMethod: PaymentMethod;
    customerId: number | null;
  };
  return ok(() => finalizeOrder(orderId, paymentMethod, customerId ?? null));
}
