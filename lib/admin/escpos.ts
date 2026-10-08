// Generador de comandos ESC/POS crudos, sin ninguna librería externa: así
// evitamos instalar un módulo nativo (escpos-usb necesita reemplazar el
// driver de la impresora por WinUSB vía Zadig, algo riesgoso para una
// impresora Windows que ya funciona) y mantenemos start-local.bat simple
// ("npm install" sin pasos de compilación). Ver lib/admin/print-direct.ts
// para cómo se manda esto a la impresora real en Windows.
import { money } from "@/lib/admin/format";
import type { PrintConfig } from "@/lib/admin/types";
import type { ComandaPrintData, TicketPrintData } from "@/lib/admin/print-templates";

const ESC = 0x1b;
const GS = 0x1d;

// La mayoría de las impresoras térmicas genéricas (incluida una "POS-58
// Series" sin configurar a mano) vienen con la página de códigos PC437 por
// defecto, que no tiene tildes ni Ñ — imprimirlas ahí da caracteres
// basura. En vez de apostar a un comando de página de códigos que no
// podemos probar contra el hardware real, sacamos los acentos: el ticket
// se lee perfecto igual, y funciona en cualquier impresora sin importar
// cómo esté configurada.
function stripAccents(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x00-\x7e\n]/g, "?");
}

function charsFor(widthMm: PrintConfig["paperWidthMm"]) {
  return widthMm === 58 ? 32 : 48;
}

function row(left: string, right: string, width: number) {
  const l = stripAccents(left);
  const r = stripAccents(right);
  if (l.length + r.length + 1 > width) {
    const maxLeft = Math.max(0, width - r.length - 1);
    return `${l.slice(0, maxLeft)} ${r}`;
  }
  return l + " ".repeat(width - l.length - r.length) + r;
}

class EscPosBuilder {
  private chunks: Buffer[] = [];

  private raw(bytes: number[]) {
    this.chunks.push(Buffer.from(bytes));
    return this;
  }

  init() {
    return this.raw([ESC, 0x40]);
  }

  align(mode: "left" | "center" | "right") {
    const n = mode === "center" ? 1 : mode === "right" ? 2 : 0;
    return this.raw([ESC, 0x61, n]);
  }

  bold(on: boolean) {
    return this.raw([ESC, 0x45, on ? 1 : 0]);
  }

  size(width: 1 | 2, height: 1 | 2) {
    const n = ((width - 1) << 4) | (height - 1);
    return this.raw([GS, 0x21, n]);
  }

  line(text = "") {
    this.chunks.push(Buffer.from(`${stripAccents(text)}\n`, "ascii"));
    return this;
  }

  hr(width: number) {
    return this.line("-".repeat(width));
  }

  feed(lines: number) {
    return this.raw([ESC, 0x64, lines]);
  }

  cut() {
    this.feed(3);
    return this.raw([GS, 0x56, 0x00]);
  }

  build(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

export function renderComandaEscPos(data: ComandaPrintData, config: PrintConfig): Buffer {
  const width = charsFor(config.paperWidthMm);
  const originLabel =
    data.origin === "delivery" ? "DELIVERY" : data.tableNumber ? `MESA ${data.tableNumber}` : "MOSTRADOR";
  const time = new Date(data.openedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  const shortId = data.orderId.slice(0, 8).toUpperCase();

  const b = new EscPosBuilder().init();

  if (config.headerText) {
    b.align("center").bold(true).line(config.headerText).bold(false);
  }

  // Título del origen a tamaño doble, como pide la comanda de cocina.
  b.align("center").size(2, 2).bold(true).line(originLabel).size(1, 1).bold(false);

  b.align("left").line(`Venta #${shortId} - ${time}`);
  if (data.customerName) b.line(data.customerName);
  b.hr(width);

  let printedAny = false;
  for (const area of data.areas) {
    if (area.items.length === 0) continue;
    printedAny = true;
    b.bold(true).line(`-- ${area.name.toUpperCase()} --`).bold(false);
    for (const item of area.items) {
      b.line(row(item.name, `x${item.qty}`, width));
      if (item.note) b.line(`  - ${item.note}`);
    }
    b.feed(1);
  }
  if (!printedAny) b.align("center").line("Sin productos enviados").align("left");

  if (data.notes) {
    b.hr(width).bold(true).line("NOTAS:").bold(false).line(data.notes);
  }

  if (config.footerText) {
    b.hr(width).align("center").line(config.footerText);
  }

  b.cut();
  return b.build();
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cuenta_corriente: "Cta. Cte.",
};

export function renderTicketEscPos(data: TicketPrintData, config: PrintConfig): Buffer {
  const width = charsFor(config.paperWidthMm);
  const originLabel = data.isDelivery
    ? "Delivery"
    : data.tableNumber
      ? `Mesa ${data.tableNumber}`
      : "Mostrador";
  const time = new Date(data.openedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  const shortId = data.orderId.slice(0, 8).toUpperCase();

  const b = new EscPosBuilder().init();

  // "Logo centrado": imprimir el bitmap real de una URL necesitaría
  // convertir la imagen a 1-bit en el ancho exacto del rollo (y probarlo
  // contra la impresora real para ajustar el dithering), algo que no se
  // puede validar a ciegas sin el hardware. Mientras tanto, el nombre del
  // local bien grande y centrado cumple el mismo rol visual en el ticket.
  if (config.headerText) {
    b.align("center").bold(true).size(2, 1).line(config.headerText).size(1, 1).bold(false);
  }

  b.align("center").bold(true).line(originLabel).bold(false);
  b.line(`Pedido #${shortId} - ${time}`);

  if (data.customerName || data.customerPhone || data.customerAddress) {
    b.hr(width).align("left");
    if (data.customerName) b.line(data.customerName);
    if (data.customerPhone) b.line(data.customerPhone);
    if (data.customerAddress) b.line(data.customerAddress);
  }

  b.align("left").hr(width);
  if (data.items.length === 0) {
    b.align("center").line("Sin productos").align("left");
  } else {
    for (const item of data.items) {
      b.line(row(`${item.qty}x ${item.name}`, money(item.price * item.qty), width));
      if (item.note) b.line(`  - ${item.note}`);
    }
  }

  if (data.isDelivery && data.shippingCost > 0) {
    b.line(row("Envio", money(data.shippingCost), width));
  }

  b.hr(width);
  b.bold(true).size(2, 1).line(row("TOTAL", money(data.total), Math.ceil(width / 2))).size(1, 1).bold(false);

  if (data.status === "cerrada") {
    const label = data.paymentMethod ? PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod : "-";
    b.line(row("Medio de pago", label, width));
  } else {
    b.line(row("Estado", "Precuenta (sin cobrar)", width));
  }

  if (config.footerText) {
    b.hr(width).align("center").line(config.footerText);
  }

  b.cut();
  return b.build();
}
