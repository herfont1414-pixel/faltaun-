import type { MenuItem } from "@/lib/types";

// Valor de respaldo para instalaciones que todavía no cargaron el número en
// Configuración (gestion_business_config): así el sitio sigue funcionando
// sin redeploy ni pasos extra. Una vez cargado en el admin, ese valor pisa
// a este cada vez que se llama a estas funciones pasando `number`.
const DEFAULT_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

export function buildWhatsAppLink(message: string, number?: string) {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${number || DEFAULT_WHATSAPP_NUMBER}?text=${encoded}`;
}

export function buildMenuItemInquiry(item: MenuItem, number?: string) {
  return buildWhatsAppLink(
    `Hola! Quiero consultar por "${item.name}" ($${item.price}) del menú de Madero Restó.`,
    number
  );
}

export interface OrderSummaryInput {
  customerName: string;
  items: { name: string; qty: number; price: number }[];
  fulfillment: "delivery" | "retiro";
  address?: string | null;
  zone?: string | null;
  scheduleLabel?: string | null;
  subtotal: number;
  shippingCost: number;
  total: number;
  notes?: string | null;
  paymentMethod?: "efectivo" | "transferencia" | null;
  transferAlias?: string | null;
  businessNumber?: string;
}

export function buildOrderWhatsAppLink(input: OrderSummaryInput) {
  const lines = [
    `Hola! Soy ${input.customerName} y acabo de hacer un pedido en el menú online de Madero Restó:`,
    "",
    ...input.items.map((it) => `• ${it.qty}x ${it.name} ($${(it.price * it.qty).toLocaleString("es-AR")})`),
    "",
    input.fulfillment === "delivery" ? "Modalidad: Delivery" : "Modalidad: Retiro en el local",
  ];
  if (input.fulfillment === "delivery" && input.address) {
    lines.push(`Dirección: ${input.address}${input.zone ? ` (${input.zone})` : ""}`);
  }
  if (input.scheduleLabel) lines.push(`Horario: ${input.scheduleLabel}`);
  lines.push("", `Subtotal: $${input.subtotal.toLocaleString("es-AR")}`);
  if (input.shippingCost > 0) lines.push(`Envío: $${input.shippingCost.toLocaleString("es-AR")}`);
  lines.push(`Total: $${input.total.toLocaleString("es-AR")}`);
  if (input.paymentMethod === "transferencia") {
    lines.push(
      `Pago: Transferencia${input.transferAlias ? ` al alias ${input.transferAlias}` : ""}. Te mando el comprobante por acá.`
    );
  } else if (input.paymentMethod === "efectivo") {
    lines.push(
      input.fulfillment === "delivery"
        ? "Pago: Efectivo (le pago al repartidor cuando llegue)"
        : "Pago: Efectivo (pago en el local al retirar)"
    );
  }
  if (input.notes) lines.push("", `Notas: ${input.notes}`);
  lines.push("", "¡Gracias!");
  return buildWhatsAppLink(lines.join("\n"), input.businessNumber);
}
