import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { createCounterOrder } from "@/lib/admin/store";

// Pedido de mostrador: de la barra (por defecto) o por WhatsApp sin pasar por la
// página, con nombre y teléfono opcionales del cliente.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const channel = body?.channel === "whatsapp" ? "whatsapp" : "mostrador";
  return ok(request, () =>
    createCounterOrder(channel, {
      name: typeof body?.customerName === "string" ? body.customerName : null,
      phone: typeof body?.customerPhone === "string" ? body.customerPhone : null,
    })
  );
}
