import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { ensurePosOrderForWebOrder } from "@/lib/admin/web-orders";

// Devuelve (y crea si falta) el pedido real de un pedido web aceptado, junto
// con el estado del panel, para poder abrirlo y cobrarlo.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return ok(request, async () => ({ orderId: await ensurePosOrderForWebOrder(params.id) }));
}
