// Generador de comandos ESC/POS crudos, sin ninguna librería externa: así
// evitamos instalar un módulo nativo (escpos-usb necesita reemplazar el
// driver de la impresora por WinUSB vía Zadig, algo riesgoso para una
// impresora Windows que ya funciona) y mantenemos start-local.bat simple
// ("npm install" sin pasos de compilación). Ver lib/admin/print-direct.ts
// para cómo se manda esto a la impresora real en Windows.
import { money } from "@/lib/admin/format";
import type { PrintConfig } from "@/lib/admin/types";
import { comandaHeader } from "@/lib/admin/print-templates";
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
    // Avance antes de cortar/arrancar: con 3 líneas el pie quedaba pegado al
    // borde y se cortaba a la mitad en la POS-58.
    this.feed(5);
    return this.raw([GS, 0x56, 0x00]);
  }

  build(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

// Corta un texto en líneas de hasta "width" caracteres, por palabras (una palabra más
// larga que la línea se parte). "indent" se agrega a las líneas que siguen a la primera.
function wrapWords(text: string, width: number, indent = ""): string[] {
  const out: string[] = [];
  let line = "";
  for (let word of stripAccents(text).split(/\s+/).filter(Boolean)) {
    for (;;) {
      const lead = line ? `${line} ` : out.length ? indent : "";
      if ((lead + word).length <= width) {
        line = lead + word;
        break;
      }
      if (line) {
        out.push(line);
        line = "";
        continue;
      }
      // La palabra sola no entra: se parte.
      const room = Math.max(1, width - lead.length);
      out.push(lead + word.slice(0, room));
      word = word.slice(room);
      if (!word) break;
    }
  }
  if (line) out.push(line);
  return out;
}

// Comanda de cocina como la que ya usaba el local: origen en letra doble, los datos del
// pedido en letra común y cada producto en letra DOBLE (ancho y alto) con la cantidad
// adelante. La aclaración de cada producto va debajo, en letra alta. Sin precios, forma de
// pago, encabezado ni pie: a la cocina solo le sirve qué preparar.
//
// La letra doble va SIN negrita: en la POS-58 la negrita repasa cada punto y, sumada a la
// letra doble, una línea llena (ej. "2 PAPAS CHEDAR") pedía más corriente de la que da la
// impresora: salía desteñida, cortada a la mitad, y el resto de la comanda quedaba trabado
// hasta la impresión siguiente. La letra doble ya es gruesa y se lee igual de lejos.
// Con "Cuerpo: pequeña" en Impresión, los productos van en letra alta (no ancha): la mitad
// de puntos por línea, para impresoras todavía más débiles.
export function renderComandaEscPos(data: ComandaPrintData, config: PrintConfig): Buffer {
  const width = charsFor(config.paperWidthMm);
  const small = config.fontSizeBody === "pequena";
  // En letra doble entra la mitad (a la POS-58 le entran 15 caracteres dobles por línea).
  const doubleWidth = config.paperWidthMm === 58 ? 15 : 24;
  const itemWidth = small ? width : doubleWidth;
  const { origin, lines } = comandaHeader(data);

  const b = new EscPosBuilder().init();
  b.align("center").size(2, 2);
  for (const l of wrapWords(origin, doubleWidth)) b.line(l);
  b.size(1, 1).align("left");
  for (const l of lines) for (const w of wrapWords(l, width, "  ")) b.line(w);
  b.hr(width);

  let printedAny = false;
  for (const area of data.areas) {
    if (area.items.length === 0) continue;
    printedAny = true;
    b.bold(true).line(area.name.toUpperCase()).bold(false);
    for (const item of groupItems(area.items, config.paperSavingMode)) {
      b.size(small ? 1 : 2, 2);
      for (const l of wrapWords(`${item.qty} ${item.name.toUpperCase()}`, itemWidth, "  ")) b.line(l);
      b.size(1, 2);
      if (item.note) for (const l of wrapWords(`> ${item.note}`, width - 2, "  ")) b.line(`  ${l}`);
      b.size(1, 1);
    }
    b.feed(1);
  }
  if (!printedAny) b.align("center").line("Sin productos enviados").align("left");

  if (data.notes) {
    b.hr(width).bold(true).line("NOTAS:").bold(false).size(1, 2);
    for (const l of wrapWords(data.notes, width)) b.line(l);
    b.size(1, 1);
  }

  b.cut();
  return b.build();
}

// Mismo criterio que la versión HTML: en modo ahorro se juntan líneas iguales (mismo
// producto y misma aclaración), nunca una con aclaración y otra sin.
function groupItems<T extends { name: string; qty: number; note: string | null }>(items: T[], paperSaving: boolean): T[] {
  if (!paperSaving) return items;
  const map = new Map<string, T>();
  for (const item of items) {
    const key = `${item.name}\u0000${item.note ?? ""}`;
    const existing = map.get(key);
    if (existing) existing.qty += item.qty;
    else map.set(key, { ...item });
  }
  return [...map.values()];
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
  b.line(`Pedido #${shortId}`);
  b.line(time);

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
  // En letra de doble ancho cada carácter ocupa dos columnas. La POS-58 imprime
  // 15 (no 16) caracteres dobles por línea: con 16 el último dígito del total
  // saltaba a la línea siguiente.
  b.bold(true).size(2, 1).line(row("TOTAL", money(data.total), Math.floor(width / 2) - 1)).size(1, 1).bold(false);

  if (data.status === "cerrada") {
    if (data.payments.length > 1) {
      for (const p of data.payments) {
        b.line(row(PAYMENT_LABELS[p.method] ?? p.method, money(p.amount), width));
      }
    } else {
      const label = data.paymentMethod ? PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod : "-";
      b.line(row("Medio de pago", label, width));
    }
    for (const p of data.payments) {
      if (p.receivedAmount == null) continue;
      b.line(row("Recibido", money(p.receivedAmount), width));
      b.bold(true).line(row("Vuelto", money(p.changeAmount ?? 0), width)).bold(false);
    }
  } else {
    b.line(row("Estado", "Precuenta (sin cobrar)", width));
  }

  if (config.footerText) {
    b.hr(width).align("center").line(config.footerText);
  }

  b.cut();
  return b.build();
}
