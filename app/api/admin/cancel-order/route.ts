import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { cancelOpenOrder } from "@/lib/admin/store";

// Anular un pedido abierto (no cobrado). Solo admin y encargado; queda en la auditoría.
export async function POST(request: NextRequest) {
  const { orderId, reason } = await request.json();
  return ok(
    request,
    (actor) => cancelOpenOrder(String(orderId), actor.id, typeof reason === "string" ? reason.trim().slice(0, 200) || null : null),
    ["admin", "encargado"]
  );
}
