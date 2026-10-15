import { describe, it, expect } from "vitest";
import { renderComandaEscPos } from "@/lib/admin/escpos";
import { kitchenNotes, renderComandaHtml, type ComandaPrintData } from "@/lib/admin/print-templates";
import type { PrintConfig } from "@/lib/admin/types";

const config58: PrintConfig = {
  paperWidthMm: 58,
  headerText: "Madero Resto",
  footerText: "Gracias por elegirnos",
  paperSavingMode: false,
  fontSizeHeader: "normal",
  fontSizeBody: "normal",
  fontSizeFooter: "normal",
  directPrintEnabled: true,
  printerName: "POS-58-Series",
};

// Lee el ESC/POS como lo imprime la impresora: cada línea con el ancho de letra activo.
function printed(buf: Buffer) {
  const out: { text: string; double: boolean; tall?: boolean; bold?: boolean }[] = [];
  let width = 1;
  let height = 1;
  let bold = false;
  let text = "";
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === 0x1b) {
      const cmd = buf[i + 1];
      if (cmd === 0x45) bold = buf[i + 2] === 1;
      if (cmd === 0x40) bold = false;
      i += cmd === 0x40 ? 1 : 2; // ESC @ | ESC a n / ESC E n / ESC d n
    } else if (c === 0x1d) {
      const cmd = buf[i + 1];
      if (cmd === 0x21) {
        width = (buf[i + 2] >> 4) + 1;
        height = (buf[i + 2] & 0x0f) + 1;
      }
      i += 2; // GS ! n | GS V n
    } else if (c === 0x0a) {
      out.push({ text, double: width === 2, ...(height === 2 ? { tall: true } : {}), ...(bold ? { bold: true } : {}) });
      text = "";
    } else {
      text += String.fromCharCode(c);
    }
  }
  return out;
}

const comanda: ComandaPrintData = {
  orderId: "0b0ef5fa-aaaa-bbbb-cccc-000000000000",
  tableNumber: null,
  origin: "mostrador",
  customerName: "Pepo",
  partySize: null,
  waiter: null,
  takeAway: true,
  openedAt: "2026-10-11T23:22:54Z",
  notes: kitchenNotes("Pedido web · Paga: transferencia (verificar comprobante) · Crispy con una sola carne"),
  areas: [
    {
      name: "Cocina",
      items: [
        { name: "Burger Madero Crispy (Nueva)", qty: 1, note: "doble carne, sin tomate" },
        { name: "Burguer Cebolla", qty: 2, note: null },
        { name: "Emp Osobuco", qty: 3, note: null },
      ],
    },
  ],
};

describe("comanda de cocina", () => {
  it("las notas para la cocina no llevan la forma de pago ni 'Pedido web'", () => {
    expect(kitchenNotes("Pedido web · Paga: transferencia (verificar comprobante) · sin sal")).toBe("sin sal");
    expect(kitchenNotes("Pedido web · Paga: efectivo al retirar · con $20.000, vuelto $3.500")).toBeNull();
    expect(kitchenNotes("Cumpleaños, traer vela")).toBe("Cumpleaños, traer vela");
    expect(kitchenNotes(null)).toBeNull();
  });

  it("ESC/POS: productos en letra doble con la cantidad adelante, la aclaración justo debajo y nada de cobro", () => {
    const lines = printed(renderComandaEscPos(comanda, config58));
    const all = lines.map((l) => l.text).join("\n");
    // Origen y datos.
    expect(lines.find((l) => l.text === "MOSTRADOR")!.double).toBe(true);
    expect(all).toContain("Venta: # 0B0EF5FA");
    expect(all).toContain("Cliente: Pepo");
    expect(all).toContain("Para llevar");
    expect(all).toMatch(/\d{2}\/\d{2}\/\d{2},? \d{2}:\d{2}/); // hora de 24 h, sin "p. m."
    expect(all).not.toMatch(/[ap]\. ?m\./);
    // Productos grandes: en una POS-58 entran 15 caracteres dobles por línea.
    for (const l of lines.filter((x) => x.double)) expect(l.text.length).toBeLessThanOrEqual(15);
    for (const l of lines.filter((x) => !x.double)) expect(l.text.length).toBeLessThanOrEqual(32);
    const crispyAt = lines.findIndex((l) => l.text.startsWith("1 BURGER MADERO"));
    expect(crispyAt).toBeGreaterThan(-1);
    expect(lines[crispyAt].double).toBe(true);
    // La aclaración va debajo de SU producto (antes del siguiente).
    const noteAt = lines.findIndex((l) => l.text.includes("> doble carne, sin tomate"));
    const cebollaAt = lines.findIndex((l) => l.text.startsWith("2 BURGUER"));
    // Los nombres largos siguen en la línea de abajo (con sangría), también en letra doble.
    expect(lines[cebollaAt + 1]).toEqual({ text: "  CEBOLLA", double: true, tall: true });
    expect(noteAt).toBeGreaterThan(crispyAt);
    expect(noteAt).toBeLessThan(cebollaAt);
    expect(all).toContain("3 EMP OSOBUCO");
    // Notas del cliente sí; forma de pago, encabezado y pie no.
    expect(all).toContain("NOTAS:");
    expect(all).toContain("Crispy con una sola carne");
    expect(all).not.toMatch(/Paga|transferencia|Pedido web|Gracias|Madero Resto|\$/);
  });

  it("mesa: muestra mesa, personas y mozo", () => {
    const all = printed(
      renderComandaEscPos({ ...comanda, origin: "mesa", tableNumber: 4, partySize: 3, waiter: "Juan", takeAway: false, customerName: null }, config58)
    )
      .map((l) => l.text)
      .join("\n");
    expect(all).toContain("MESA 4");
    expect(all).toContain("Personas: 3");
    expect(all).toContain("Mozo: Juan");
    expect(all).not.toContain("Para llevar");
  });

  it("modo ahorro de papel: junta iguales pero nunca mezcla una con aclaración y otra sin", () => {
    const data: ComandaPrintData = {
      ...comanda,
      areas: [{ name: "Cocina", items: [
        { name: "Burger Clasica", qty: 1, note: "sin tomate" },
        { name: "Burger Clasica", qty: 1, note: null },
        { name: "Burger Clasica", qty: 1, note: null },
      ] }],
    };
    const all = printed(renderComandaEscPos(data, { ...config58, paperSavingMode: true })).map((l) => l.text).join("\n");
    expect(all).toContain("1 BURGER\n  CLASICA");
    expect(all).toContain("2 BURGER\n  CLASICA");
    expect(all).toContain("> sin tomate");
  });

  it("la letra grande va sin negrita (la POS-58 no da abasto y salía desteñida y cortada)", () => {
    const lines = printed(renderComandaEscPos(comanda, config58));
    const big = lines.filter((l) => l.double || l.tall);
    expect(big.length).toBeGreaterThan(4);
    for (const l of big) expect(l.bold).toBeUndefined();
    // Siguen en letra doble los productos, y la aclaración en letra alta.
    expect(lines.find((l) => l.text === "1 BURGER MADERO")).toMatchObject({ double: true, tall: true });
    expect(lines.find((l) => l.text.includes("> doble carne"))).toMatchObject({ double: false, tall: true });
    expect(lines.find((l) => l.text === "COCINA")).toMatchObject({ bold: true, double: false });
  });

  it("cuerpo 'pequeña': productos en letra alta pero no ancha (entran 32 por línea)", () => {
    const lines = printed(renderComandaEscPos(comanda, { ...config58, fontSizeBody: "pequena" }));
    const item = lines.find((l) => l.text.startsWith("1 BURGER MADERO CRISPY"))!;
    expect(item).toMatchObject({ double: false, tall: true });
    for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(l.double ? 15 : 32);
    expect(lines.find((l) => l.text === "MOSTRADOR")!.double).toBe(true);
  });

  it("HTML (impresión desde el navegador): mismo contenido, aclaración debajo y sin cobro", () => {
    const html = renderComandaHtml(comanda, config58);
    expect(html).toContain("1 BURGER MADERO CRISPY (NUEVA)");
    expect(html.indexOf("&gt; doble carne, sin tomate")).toBeGreaterThan(html.indexOf("1 BURGER MADERO CRISPY"));
    expect(html.indexOf("&gt; doble carne, sin tomate")).toBeLessThan(html.indexOf("2 BURGUER CEBOLLA"));
    expect(html).not.toMatch(/Paga|transferencia|Gracias por elegirnos/);
  });
});
