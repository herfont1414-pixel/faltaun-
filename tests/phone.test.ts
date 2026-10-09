import { describe, it, expect } from "vitest";
import { whatsappDigits } from "@/lib/phone";
import { buildWhatsAppLink } from "@/lib/whatsapp";

describe("números de WhatsApp", () => {
  it.each([
    ["03755589363", "5493755589363"], // el caso real: 0 + código de área + número
    ["3755589363", "5493755589363"],
    ["3755 58-9363", "5493755589363"],
    ["0375515589363", "5493755589363"], // con el 15
    ["375515589363", "5493755589363"],
    ["011 15 2345-6789", "5491123456789"], // Buenos Aires
    ["+54 9 3755 589363", "5493755589363"],
    ["5493755589363", "5493755589363"],
    ["543755589363", "5493755589363"], // sin el 9 del móvil
    ["0054 9 3755 589363", "5493755589363"],
    ["93755589363", "5493755589363"],
    ["3755300822", "5493755300822"], // el del local, cargado sin país
  ])("%s → %s", (input, expected) => {
    expect(whatsappDigits(input)).toBe(expected);
  });

  it("vacío, nulo o de otro país no se rompe", () => {
    expect(whatsappDigits("")).toBe("");
    expect(whatsappDigits(null)).toBe("");
    expect(whatsappDigits("59899123456")).toBe("59899123456");
  });

  it("los links de WhatsApp usan el número normalizado", () => {
    expect(buildWhatsAppLink("hola", "3755300822")).toBe("https://wa.me/5493755300822?text=hola");
    expect(buildWhatsAppLink("hola", "5493755300822")).toBe("https://wa.me/5493755300822?text=hola");
  });
});
