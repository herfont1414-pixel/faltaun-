import type { Order, OrderChannel } from "@/lib/admin/types";

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  mostrador: "Mostrador",
  whatsapp: "WhatsApp",
  web: "Web",
};

export const DELIVERY_STATUS_LABEL = {
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
} as const;

// Título del panel de un pedido que no es de mesa. null = pedido de barra común.
export function orderTitle(order: Order): string | null {
  if (order.tableNumber) return null;
  const channel = order.channel ?? "mostrador";
  const parts = [
    channel !== "mostrador" ? CHANNEL_LABEL[channel] : null,
    order.isDelivery ? "Delivery" : channel !== "mostrador" || order.customerName ? "Retiro" : null,
    order.customerName,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
