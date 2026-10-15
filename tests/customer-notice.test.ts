import { describe, expect, it } from "vitest";
import { buildCustomerNotice, customerWhatsappLink } from "@/lib/order-messages";

describe("avisos por WhatsApp al cliente", () => {
  it("arma el mensaje de listo, en camino y chat", () => {
    expect(buildCustomerNotice("Tedy", "listo")).toBe("Hola Tedy, tu pedido ya está listo para retirar en Madero Restó 🙌\n¡Te esperamos!");
    expect(buildCustomerNotice("Tedy", "en_camino")).toContain("en camino 🛵");
    expect(buildCustomerNotice(null, "chat")).toBe("Hola, te escribimos de Madero Restó por tu pedido.");
  });

  it("el link va al número en formato de WhatsApp y con el texto codificado", () => {
    const link = customerWhatsappLink("03755 15-589363", "Hola Tedy, ¿listo?");
    expect(link).toBe("https://wa.me/5493755589363?text=Hola%20Tedy%2C%20%C2%BFlisto%3F");
  });
});
