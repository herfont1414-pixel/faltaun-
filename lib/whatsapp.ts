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

export function buildReservationInquiry(date: string, time: string, guests: number) {
  return buildWhatsAppLink(
    `Hola! Quiero reservar una mesa para ${guests} persona(s) el ${date} a las ${time} en Madero Restó.`
  );
}
