import { describe, it, expect } from "vitest";
import { buildOrderConfirmationMessage, orderReference } from "@/lib/order-messages";

const base = {
  id: "36935ab1-0000-4000-8000-000000000000",
  customerName: "Daniel Sebastian Pereira",
  customerAddress: "Almirante Brown, 25 de Mayo, Misiones, Argentina",
  shippingCost: 4000,
  total: 18000,
  paymentMethod: null,
} as const;

describe("mensaje de confirmación al cliente", () => {
  it("delivery: dirección, tiempo y desglose con formato de WhatsApp", () => {
    const msg = buildOrderConfirmationMessage({ ...base, fulfillment: "delivery" }, 30);
    expect(msg).toBe(
      [
        "Hola Daniel Sebastian Pereira, confirmamos tu pedido #36935A ✅",
        "",
        "🛵 *Dirección de entrega:* Almirante Brown, 25 de Mayo, Misiones, Argentina",
        "⏰ *Tiempo estimado:* 30 minutos",
        "",
        "• _Productos_: $14.000,00",
        "• _Costo de envío_: $4.000,00",
        "• *Total: $18.000,00*",
        "",
        "Para seguir el avance de tu pedido entrá a nuestro menú online y tocá el ícono 🧾 *Mis pedidos*, arriba:",
        "https://madero14.vercel.app",
        "",
        "¡Gracias por tu compra!",
        "Madero Restó",
      ].join("\n")
    );
  });

  it("retiro: sin dirección ni costo de envío", () => {
    const msg = buildOrderConfirmationMessage(
      { ...base, fulfillment: "retiro", customerAddress: null, shippingCost: 0, total: 14000 },
      15
    );
    expect(msg).toContain("🏪 *Retiro en el local*");
    expect(msg).not.toContain("Costo de envío");
    expect(msg).not.toContain("Dirección");
    expect(msg).toContain("• *Total: $14.000,00*");
  });

  it("incluye el medio de pago cuando el cliente lo eligió", () => {
    const msg = buildOrderConfirmationMessage({ ...base, fulfillment: "delivery", paymentMethod: "transferencia" }, 30);
    expect(msg).toContain("Pago: transferencia");
  });

  it("referencia corta a partir del id", () => {
    expect(orderReference("abc-123-def")).toBe("ABC123");
  });
});
