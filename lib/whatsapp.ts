import type { MenuItem } from "@/lib/types";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

export function buildWhatsAppLink(message: string) {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
}

export function buildMenuItemInquiry(item: MenuItem) {
  return buildWhatsAppLink(
    `Hola! Quiero consultar por "${item.name}" ($${item.price}) del menú de Madero Restó.`
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
  if (input.notes) lines.push("", `Notas: ${input.notes}`);
  lines.push("", "¡Gracias!");
  return buildWhatsAppLink(lines.join("\n"));
}
