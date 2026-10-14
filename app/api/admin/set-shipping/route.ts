import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { setShippingCost } from "@/lib/admin/store";

// Cambiar a mano el precio del envío de un pedido de delivery abierto.
export async function POST(request: NextRequest) {
  const { orderId, shippingCost } = await request.json();
  return ok(request, () => setShippingCost(String(orderId), Number(shippingCost)));
}
