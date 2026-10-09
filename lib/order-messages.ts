import type { WebOrder } from "@/lib/admin/types";

// Formato de plata del mensaje: $14.000,00 (separador de miles y dos decimales).
function ars(amount: number) {
  return `$${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Menú online público: ahí el cliente sigue su pedido (ícono "Mis pedidos").
export const MENU_URL = "https://madero14.vercel.app";

// Referencia corta para el cliente, derivada del id del pedido (no hay un
// número correlativo de pedidos web): los primeros 6 caracteres en mayúscula.
export function orderReference(id: string) {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
}

// Mensaje de WhatsApp que se manda al cliente cuando el local acepta su pedido.
// Usa el formato de WhatsApp: *negrita* y _cursiva_.
export function buildOrderConfirmationMessage(
  order: Pick<
    WebOrder,
    "id" | "customerName" | "fulfillment" | "customerAddress" | "shippingCost" | "total" | "paymentMethod"
  >,
  etaMinutes: number
) {
  const lines = [`Hola ${order.customerName}, confirmamos tu pedido #${orderReference(order.id)} ✅`, ""];
  if (order.fulfillment === "delivery") {
    lines.push(`🛵 *Dirección de entrega:* ${order.customerAddress ?? "a coordinar"}`);
  } else {
    lines.push("🏪 *Retiro en el local*");
  }
  lines.push(`⏰ *Tiempo estimado:* ${etaMinutes} minutos`, "");
  const productos = order.total - order.shippingCost;
  lines.push(`• _Productos_: ${ars(productos)}`);
  if (order.fulfillment === "delivery") lines.push(`• _Costo de envío_: ${ars(order.shippingCost)}`);
  lines.push(`• *Total: ${ars(order.total)}*`);
  if (order.paymentMethod === "transferencia") lines.push("", "💳 Pago: transferencia");
  else if (order.paymentMethod === "efectivo") lines.push("", "💵 Pago: efectivo");
  lines.push(
    "",
    "Para seguir el avance de tu pedido entrá a nuestro menú online y tocá el ícono 🧾 *Mis pedidos*, arriba:",
    MENU_URL
  );
  lines.push("", "¡Gracias por tu compra!", "Madero Restó");
  return lines.join("\n");
}
