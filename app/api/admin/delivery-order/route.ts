import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { createDeliveryOrder, listDeliveryZones } from "@/lib/admin/store";

// Pedido delivery cargado desde el panel. Nombre, teléfono y dirección son
// opcionales; el costo del envío sale siempre de la zona guardada en el servidor.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name?: string;
    phone?: string;
    address?: string;
    zone?: string | null;
    channel?: "mostrador" | "whatsapp";
  };
  return ok(request, async () => {
    let shippingCost = 0;
    const zone = body.zone?.trim() || null;
    if (zone) {
      const found = (await listDeliveryZones()).find((z) => z.name === zone);
      if (!found) throw new Error("La zona de envío elegida no existe");
      shippingCost = found.cost;
    }
    return createDeliveryOrder({
      name: body.name ?? "",
      phone: body.phone ?? "",
      address: body.address ?? "",
      zone,
      shippingCost,
      channel: body.channel === "mostrador" ? "mostrador" : "whatsapp",
    });
  });
}
