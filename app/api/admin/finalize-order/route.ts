import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { finalizeOrder } from "@/lib/admin/store";
import { getPool } from "@/lib/admin/db";
import { addStamp, recoverClosedOrderStamp } from "@/lib/admin/loyalty";
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
    let result;
    try {
      result = await finalizeOrder(orderId, payments, customerId ?? null, actor.id);
    } catch (error) {
      // Reintento después de un cobro que sí se registró pero cuyo sello falló (ver más abajo):
      // solo completa el sello pendiente, sin cobrar ni auditar otra vez. Si el pedido ya tiene
      // su sello, o no se cerró hace poco, se devuelve el error original ("ya fue cerrado").
      if (loyaltyPhone && error instanceof Error && error.message === "El pedido ya fue cerrado") {
        const recovered = await recoverClosedOrderStamp(orderId, loyaltyPhone);
        if (recovered) return { total: recovered.total, origin: recovered.origin, payments: [] };
      }
      throw error;
    }
    if (loyaltyPhone) {
      // Un pedido web ya sumó su sello al aceptarse (con el id del pedido web):
      // se usa ese mismo id para que cobrarlo no sume un segundo sello.
      const { rows: web } = await getPool().query<{ id: string }>(
        "select id from gestion_web_orders where order_id = $1",
        [orderId]
      );
      try {
        await addStamp(loyaltyPhone, web[0]?.id ?? orderId, { orderTotal: result.total, origin: result.origin });
      } catch (error) {
        console.error("No se pudo registrar el sello de fidelidad", error);
        // El cobro ya está hecho: queda su auditoría y el aviso de reintentar solo el sello.
        await recordAudit({
          userId: actor.id,
          action: "order_close",
          entity: "gestion_orders",
          entityId: orderId,
          newValue: { total: result.total, origin: result.origin, payments: result.payments },
        }).catch(() => {});
        throw new Error(
          "El cobro se registró, pero no se pudo sumar el sello de fidelidad. Tocá cobrar de nuevo para reintentar solo el sello."
        );
      }
    }
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
