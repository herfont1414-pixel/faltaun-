import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { createWebOrder, respondWebOrder, listWebOrders } from "@/lib/admin/web-orders";
import { getBusinessConfig, updateBusinessConfig } from "@/lib/admin/business-config";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";
import { getState } from "@/lib/admin/store";

let dbPath: string;
let productName: string;

beforeAll(async () => {
  dbPath = await seedFreshDb("web-payment");
  productName = (await anyInStockProduct()).name;
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

function order(paymentMethod: unknown, fulfillment: "retiro" | "delivery" = "retiro") {
  return createWebOrder({
    customerName: "Pago",
    customerPhone: "5493751000111",
    notes: null,
    items: [{ name: productName, qty: 1 }],
    fulfillment,
    customerAddress: null,
    deliveryZone: null,
    paymentMethod: paymentMethod as "efectivo" | "transferencia" | null,
  });
}

describe("pago elegido en el pedido online", () => {
  it("el alias se guarda y se lee de la configuración del local", async () => {
    expect((await getBusinessConfig()).transferAlias).toBe("");
    await updateBusinessConfig({ transferAlias: "  madero.resto ", transferHolder: "Hernán" });
    expect(await getBusinessConfig()).toMatchObject({ transferAlias: "madero.resto", transferHolder: "Hernán" });
    // guardar otro dato no pisa el alias
    await updateBusinessConfig({ hours: "Mar a Dom" });
    expect((await getBusinessConfig()).transferAlias).toBe("madero.resto");
  });

  it("sin alias cargado no se puede elegir transferencia, pero efectivo sí", async () => {
    await updateBusinessConfig({ transferAlias: "" });
    await expect(order("transferencia")).rejects.toThrow("transferencia no está disponible");
    const cash = await order("efectivo");
    expect(cash.paymentMethod).toBe("efectivo");
    await updateBusinessConfig({ transferAlias: "madero.resto" });
  });

  it("guarda el medio elegido y rechaza cualquier otro (link de pago, valores inventados)", async () => {
    const t = await order("transferencia");
    expect(t.paymentMethod).toBe("transferencia");
    await expect(order("link_de_pago")).rejects.toThrow("efectivo o transferencia");
    await expect(order("tarjeta")).rejects.toThrow("efectivo o transferencia");
    // una versión vieja del menú sin medio de pago sigue pudiendo pedir
    expect((await order(null)).paymentMethod).toBeNull();
  });

  it("el pedido real aceptado deja avisado cómo va a pagar", async () => {
    const delivery = await order("efectivo", "delivery").catch(() => null);
    expect(delivery).toBeNull(); // delivery sin zona se rechaza, no es el caso de este test

    const retiro = await order("transferencia");
    const { orderId } = await respondWebOrder(retiro.id, "confirmado", 20);
    const pos = (await getState()).openOrders.find((o) => o.id === orderId)!;
    expect(pos.notes).toContain("Paga: transferencia");

    const cash = await order("efectivo");
    const { orderId: cashId } = await respondWebOrder(cash.id, "confirmado", 20);
    expect((await getState()).openOrders.find((o) => o.id === cashId)!.notes).toContain("efectivo al retirar");

    const listed = (await listWebOrders()).find((o) => o.id === retiro.id)!;
    expect(listed.paymentMethod).toBe("transferencia");
  });

  it("el mensaje de WhatsApp incluye cómo paga y el alias", () => {
    const base = {
      customerName: "Ana",
      items: [{ name: "Papas", qty: 1, price: 8000 }],
      subtotal: 8000,
      shippingCost: 0,
      total: 8000,
    };
    const decode = (url: string) => decodeURIComponent(url.split("text=")[1]);
    const transfer = decode(
      buildOrderWhatsAppLink({ ...base, fulfillment: "retiro", paymentMethod: "transferencia", transferAlias: "madero.resto" })
    );
    expect(transfer).toContain("Pago: Transferencia al alias madero.resto");
    expect(transfer).toContain("comprobante");
    const cashDelivery = decode(buildOrderWhatsAppLink({ ...base, fulfillment: "delivery", paymentMethod: "efectivo" }));
    expect(cashDelivery).toContain("al repartidor");
    const cashPickup = decode(buildOrderWhatsAppLink({ ...base, fulfillment: "retiro", paymentMethod: "efectivo" }));
    expect(cashPickup).toContain("en el local al retirar");
  });
});
