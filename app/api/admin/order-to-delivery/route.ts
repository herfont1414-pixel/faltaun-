import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { convertToDelivery } from "@/lib/admin/store";

// Pasa a delivery un pedido de mostrador abierto (ver convertToDelivery). El envío sale de la zona
// guardada en el servidor.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    orderId?: string;
    name?: string;
    phone?: string;
    address?: string;
    zone?: string | null;
  };
  return ok(request, async (user) => {
    if (!body.orderId) throw new Error("Falta el pedido");
    return convertToDelivery(
      String(body.orderId),
      { name: body.name ?? "", phone: body.phone ?? "", address: body.address ?? "", zone: body.zone ?? null },
      user.id
    );
  });
}
