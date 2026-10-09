import { money } from "@/lib/admin/format";
import type { PrintConfig } from "@/lib/admin/types";
import type { PrintableOrder } from "@/lib/admin/print";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tamaños pensados para impresoras térmicas de ticket (58/80mm), que suelen
// quedar diminutos si se usan los px "de pantalla" típicos de una web. El
// cuerpo arranca en 16px (~12pt) y el encabezado bien grande para que se lea
// de lejos; "pequeña" achica pero sin bajar de un piso legible en papel.
function fontPx(size: "normal" | "pequena", normal: number, pequena: number) {
  return size === "pequena" ? pequena : normal;
}

function baseStyles(config: PrintConfig) {
  return `
    @page { size: ${config.paperWidthMm}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      width: ${config.paperWidthMm}mm;
      max-width: ${config.paperWidthMm}mm;
      padding: 8px 8px 16px;
      font-family: "Courier New", monospace;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .row { display: flex; justify-content: space-between; gap: 8px; page-break-inside: avoid; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    .header-text { font-size: ${fontPx(config.fontSizeHeader, 22, 18)}px; line-height: 1.3; }
    .body-text { font-size: ${fontPx(config.fontSizeBody, 16, 13)}px; line-height: 1.4; }
    .footer-text { font-size: ${fontPx(config.fontSizeFooter, 13, 11)}px; line-height: 1.3; }
    .area-block { margin-top: 10px; page-break-inside: avoid; }
    /* Nota de ítem en el ticket del cliente: chica y discreta. En la
       comanda de cocina se usa .comanda-item-note, bien destacada, más
       abajo — son casos distintos a propósito. */
    .item-note { font-size: ${fontPx(config.fontSizeBody, 16, 13) - 2}px; color: #333; margin: 1px 0 2px 10px; }
    .logo-img { display: block; margin: 0 auto 6px; max-width: 70%; max-height: 90px; object-fit: contain; }
    /* Comanda de cocina: el título de mesa/origen va en negrita a tamaño
       normal (no gigante), y el detalle de platos se destaca más grande
       y en negrita para leerse rápido desde lejos. */
    .comanda-origin { font-size: ${fontPx(config.fontSizeHeader, 22, 18)}px; font-weight: 700; line-height: 1.3; }
    .comanda-item { font-size: ${fontPx(config.fontSizeBody, 18, 15)}px; font-weight: 700; line-height: 1.4; }
    .comanda-item-note { font-size: ${fontPx(config.fontSizeBody, 16, 13)}px; font-weight: 700; margin: 0 0 4px 12px; }
  `;
}

function groupForPrint<T extends { name: string; qty: number }>(items: T[], paperSaving: boolean): T[] {
  if (!paperSaving) return items;
  const order: string[] = [];
  const map = new Map<string, T>();
  for (const item of items) {
    const existing = map.get(item.name);
    if (existing) {
      existing.qty += item.qty;
    } else {
      map.set(item.name, { ...item });
      order.push(item.name);
    }
  }
  return order.map((name) => map.get(name)!);
}

function wrap(config: PrintConfig, body: string) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Impresión</title>
<style>${baseStyles(config)}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export interface ComandaPrintData {
  orderId: string;
  tableNumber: number | null;
  origin: "mesa" | "mostrador" | "delivery";
  customerName: string | null;
  partySize: number | null;
  openedAt: string;
  notes: string | null;
  areas: { name: string; items: { name: string; qty: number; note: string | null }[] }[];
}

// Arma los datos de impresión de la comanda a partir de lo que devuelve
// getPrintableOrder, agrupando por área. La usan tanto la ruta HTML
// (navegador) como la ruta ESC/POS (impresión directa), para no repetir
// este mapeo en los dos lugares.
export function toComandaPrintData(order: PrintableOrder): ComandaPrintData {
  return {
    orderId: order.orderId,
    tableNumber: order.tableNumber,
    origin: order.origin,
    customerName: order.customerName,
    partySize: order.partySize,
    openedAt: order.openedAt,
    notes: order.notes,
    areas: order.areas.map((name) => ({
      name,
      items: order.items
        .filter((it) => it.area === name)
        .map((it) => ({ name: it.name, qty: it.qty, note: it.note })),
    })),
  };
}

export function renderComandaHtml(data: ComandaPrintData, config: PrintConfig): string {
  const originLabel =
    data.origin === "delivery" ? "Delivery" : data.tableNumber ? `Mesa ${data.tableNumber}` : "Mostrador";
  const time = new Date(data.openedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  const shortId = data.orderId.slice(0, 8).toUpperCase();

  const areasHtml = data.areas
    .map((area) => {
      const items = groupForPrint(area.items, config.paperSavingMode);
      if (items.length === 0) return "";
      return `
        <div class="area-block">
          <div class="bold body-text">— ${escapeHtml(area.name.toUpperCase())} —</div>
          ${items
            .map(
              (item) => `
            <div class="row comanda-item">
              <span>${escapeHtml(item.name)}</span>
              <span>x${item.qty}</span>
            </div>
            ${item.note ? `<div class="comanda-item-note">- ${escapeHtml(item.note)}</div>` : ""}`
            )
            .join("")}
        </div>`;
    })
    .join("");

  const customerLine = [data.customerName, data.partySize ? `${data.partySize} personas` : null]
    .filter(Boolean)
    .join(" · ");

  const body = `
    ${config.headerText ? `<div class="center bold header-text">${escapeHtml(config.headerText)}</div>` : ""}
    <div class="center comanda-origin" style="margin-top: 4px">${escapeHtml(originLabel)}</div>
    ${customerLine ? `<div class="center body-text">${escapeHtml(customerLine)}</div>` : ""}
    <div class="center body-text">Venta #${shortId} · ${time}</div>
    <hr />
    ${areasHtml || `<div class="center body-text">Sin productos enviados</div>`}
    ${data.notes ? `<hr /><div class="bold body-text">Notas:</div><div class="body-text">${escapeHtml(data.notes)}</div>` : ""}
    ${config.footerText ? `<hr /><div class="center footer-text">${escapeHtml(config.footerText)}</div>` : ""}
  `;

  return wrap(config, body);
}

export interface TicketPrintData {
  orderId: string;
  tableNumber: number | null;
  origin: "mesa" | "mostrador";
  isDelivery: boolean;
  status: "abierta" | "cerrada";
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  openedAt: string;
  items: { name: string; qty: number; price: number; note: string | null }[];
  shippingCost: number;
  total: number;
  paymentMethod: string | null;
  payments: { method: string; amount: number; receivedAmount?: number | null; changeAmount?: number | null }[];
  logoUrl?: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cuenta_corriente: "Cta. Cte.",
};

export function renderTicketHtml(data: TicketPrintData, config: PrintConfig): string {
  const originLabel = data.isDelivery
    ? "Delivery"
    : data.tableNumber
      ? `Mesa ${data.tableNumber}`
      : "Mostrador";
  const time = new Date(data.openedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  const shortId = data.orderId.slice(0, 8).toUpperCase();
  const items = groupForPrint(data.items, config.paperSavingMode);

  const itemsHtml = items
    .map(
      (item) => `
      <div class="row body-text">
        <span>${item.qty}x ${escapeHtml(item.name)}</span>
        <span>${money(item.price * item.qty)}</span>
      </div>
      ${item.note ? `<div class="item-note">- ${escapeHtml(item.note)}</div>` : ""}`
    )
    .join("");

  const paymentLine =
    data.status === "cerrada"
      ? data.payments.length > 1
        ? data.payments
            .map(
              (p) =>
                `<div class="row body-text"><span>${escapeHtml(PAYMENT_LABELS[p.method] ?? p.method)}</span><span>${money(p.amount)}</span></div>`
            )
            .join("")
        : `<div class="row body-text bold"><span>Medio de pago</span><span>${
            data.paymentMethod ? PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod : "—"
          }</span></div>`
      : `<div class="row body-text"><span>Estado</span><span>Precuenta (sin cobrar)</span></div>`;

  // Efectivo con "recibido" cargado: se muestra lo que entregó el cliente y el
  // vuelto. Es informativo; el total y la caja son siempre el importe aplicado.
  const cashDetailHtml =
    data.status === "cerrada"
      ? data.payments
          .filter((p) => p.receivedAmount != null)
          .map(
            (p) =>
              `<div class="row body-text"><span>Recibido</span><span>${money(p.receivedAmount ?? 0)}</span></div>` +
              `<div class="row body-text bold"><span>Vuelto</span><span>${money(p.changeAmount ?? 0)}</span></div>`
          )
          .join("")
      : "";

  const customerHtml =
    data.customerName || data.customerPhone || data.customerAddress
      ? `
        <hr />
        ${data.customerName ? `<div class="body-text">${escapeHtml(data.customerName)}</div>` : ""}
        ${data.customerPhone ? `<div class="body-text">${escapeHtml(data.customerPhone)}</div>` : ""}
        ${data.customerAddress ? `<div class="body-text">${escapeHtml(data.customerAddress)}</div>` : ""}
      `
      : "";

  const body = `
    ${data.logoUrl ? `<img class="logo-img" src="${escapeHtml(data.logoUrl)}" alt="" />` : ""}
    ${config.headerText ? `<div class="center bold header-text">${escapeHtml(config.headerText)}</div>` : ""}
    <div class="center bold header-text" style="margin-top: 4px">${escapeHtml(originLabel)}</div>
    <div class="center body-text">Pedido #${shortId} · ${time}</div>
    ${customerHtml}
    <hr />
    ${itemsHtml || `<div class="center body-text">Sin productos</div>`}
    ${
      data.isDelivery && data.shippingCost > 0
        ? `<div class="row body-text"><span>Envío</span><span>${money(data.shippingCost)}</span></div>`
        : ""
    }
    <hr />
    <div class="row bold header-text"><span>TOTAL</span><span>${money(data.total)}</span></div>
    ${paymentLine}
    ${cashDetailHtml}
    ${config.footerText ? `<hr /><div class="center footer-text">${escapeHtml(config.footerText)}</div>` : ""}
  `;

  return wrap(config, body);
}
