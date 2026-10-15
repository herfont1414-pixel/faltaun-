import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { finalizeOrder } from "@/lib/admin/store";
import { getPool } from "@/lib/admin/db";
import { addStamp, recoverClosedOrderStamp } from "@/lib/admin/loyalty";
import type { StampResult } from "@/lib/admin/loyalty";
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
    // Un pedido hecho desde el menú online suma su sello recién acá, al cobrarlo (no al
    // aceptarlo): si el cliente nunca lo retira ni lo paga, no se lleva el sello. La clave
    // es el id del pedido web, y si en el cobro no se cargó otro teléfono se usa el del pedido.
    const { rows: web } = await getPool().query<{ id: string; customer_phone: string | null; customer_name: string | null }>(
      "select id, customer_phone, customer_name from gestion_web_orders where order_id = $1",
      [orderId]
    );
    const stampPhone = loyaltyPhone?.trim() || web[0]?.customer_phone?.trim() || null;
    const stampKey = web[0]?.id ?? orderId;

    let result;
    try {
      result = await finalizeOrder(orderId, payments, customerId ?? null, actor.id);
    } catch (error) {
      // Reintento después de un cobro que sí se registró pero cuyo sello falló (ver más abajo):
      // solo completa el sello pendiente, sin cobrar ni auditar otra vez. Si el pedido ya tiene
      // su sello, o no se cerró hace poco, se devuelve el error original ("ya fue cerrado").
      if (stampPhone && error instanceof Error && error.message === "El pedido ya fue cerrado") {
        const recovered = await recoverClosedOrderStamp(orderId, stampPhone, actor.id);
        if (recovered) return { total: recovered.total, origin: recovered.origin, payments: [], loyalty: recovered.stamp };
      }
      throw error;
    }
    let loyalty: StampResult | null = null;
    if (stampPhone) {
      try {
        const account = await addStamp(stampPhone, stampKey, {
          orderTotal: result.total,
          origin: web[0] ? "web" : result.origin,
          name: web[0]?.customer_name ?? null,
          userId: actor.id,
        });
        loyalty = account.stamp;
      } catch (error) {
        console.error("No se pudo registrar el sello de fidelidad", error);
        // El cobro ya está hecho: queda su auditoría y el aviso de reintentar solo el sello.
        await recordAudit({
          userId: actor.id,
          action: "order_close",
          entity: "gestion_orders",
          entityId: orderId,
          newValue: { total: result.total, origin: result.origin, payments: result.payments, loyaltyPhone: stampPhone },
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
      newValue: {
        total: result.total,
        origin: result.origin,
        payments: result.payments,
        loyaltyPhone: stampPhone,
        stamp: loyalty ? (loyalty.awarded ? "sumado" : loyalty.reason) : null,
      },
    });
    return { ...result, loyalty };
  });
}
