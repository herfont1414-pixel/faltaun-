// Imagen tamaño historia (1080×1920) para que el cliente comparta su pedido en Instagram,
// WhatsApp o Facebook. Se dibuja en el celular del cliente (canvas): no usa la base ni el
// servidor. Estilo de los flyers de Madero: fondo oscuro cálido, logo crema, títulos con
// letra gastada y la lista del pedido en letra de máquina. No lleva nombre ni teléfono.
import { INSTAGRAM_HANDLE } from "@/lib/brand";

export interface ShareCardItem {
  name: string;
  qty: number;
}

const W = 1080;
const H = 1920;
const CREAM = "#efe3cc";
const GOLD = "#d6b480";
const EMBER = "#e58a3c";
const BG = "#1a110b";

const HEADLINES = ["¡Mi cena de hoy!", "Noche de Madero", "Hoy se come rico", "¡Llegó lo mejor!"];

// Mismo pedido, mismo título (no cambia cada vez que se toca el botón).
export function pickHeadline(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HEADLINES[h % HEADLINES.length];
}

// Líneas del pedido: hasta 5 productos y "y N más". Exportada para probarla sin canvas.
export function itemLines(items: ShareCardItem[], max = 5): string[] {
  const lines = items.slice(0, max).map((it) => `${it.qty > 1 ? `${it.qty}x ` : ""}${it.name}`);
  const rest = items.length - max;
  if (rest > 0) lines.push(`y ${rest} ${rest === 1 ? "producto" : "productos"} más`);
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar el logo"));
    img.src = src;
  });
}

// Texto con separación entre letras (letterSpacing de canvas no anda en todos los celulares).
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = "center";
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// Título con textura gastada: se escribe en una capa aparte y se le "comen" puntitos.
function grungeTitle(text: string, font: string, color: string, width: number, height: number, seed: number) {
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const l = layer.getContext("2d")!;
  l.font = font;
  l.fillStyle = color;
  l.textAlign = "center";
  l.textBaseline = "middle";
  let size = parseInt(font.match(/(\d+)px/)?.[1] ?? "120", 10);
  while (l.measureText(text).width > width - 40 && size > 40) {
    size -= 4;
    l.font = font.replace(/\d+px/, `${size}px`);
  }
  l.fillText(text, width / 2, height / 2);
  l.globalCompositeOperation = "destination-out";
  let s = seed || 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) {
    l.globalAlpha = 0.35 + rand() * 0.65;
    l.fillRect(rand() * width, rand() * height, 1 + rand() * 3, 1 + rand() * 3);
  }
  return layer;
}

export async function renderShareCard(opts: { items: ShareCardItem[]; seed: string; menuUrl: string }): Promise<Blob> {
  if (document.fonts) {
    await Promise.all([document.fonts.load("120px MaderoAnton"), document.fonts.load("52px MaderoElite")]).catch(() => {});
  }
  const logo = await loadImage("/brand/madero-logo-crema.png");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Fondo: marrón oscuro con un brillo cálido al centro y bordes más oscuros.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 980, 60, W / 2, 980, 980);
  glow.addColorStop(0, "rgba(217,123,63,0.30)");
  glow.addColorStop(0.55, "rgba(120,62,28,0.12)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  let seedNum = 0;
  for (const ch of opts.seed) seedNum = (seedNum * 31 + ch.charCodeAt(0)) % 2147483647;
  let s = seedNum || 11;
  const rand = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(255,236,210,${0.02 + rand() * 0.05})`;
    ctx.fillRect(rand() * W, rand() * H, 2, 2);
  }

  // Marco fino.
  ctx.strokeStyle = "rgba(214,180,128,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(46, 46, W - 92, H - 92);

  ctx.font = "300 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = GOLD;
  spaced(ctx, "HOY PEDÍ EN", W / 2, 250, 12);

  const logoW = 600;
  const logoH = (logo.height / logo.width) * logoW;
  ctx.drawImage(logo, (W - logoW) / 2, 290, logoW, logoH);

  const title = grungeTitle(pickHeadline(opts.seed).toUpperCase(), "170px MaderoAnton", CREAM, W - 120, 240, seedNum);
  ctx.drawImage(title, 60, 290 + logoH + 20);

  // Lista del pedido.
  let y = 290 + logoH + 20 + 240 + 90;
  ctx.font = "54px MaderoElite, 'Courier New', monospace";
  ctx.fillStyle = CREAM;
  for (const line of itemLines(opts.items)) {
    ctx.fillText(fitText(ctx, line, W - 200), W / 2, y);
    y += 78;
  }

  // Adorno.
  y += 10;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 150, y);
  ctx.lineTo(W / 2 - 30, y);
  ctx.moveTo(W / 2 + 30, y);
  ctx.lineTo(W / 2 + 150, y);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(W / 2, y, 9, 0, Math.PI * 2);
  ctx.fill();

  // Pie: dónde pedir y el Instagram.
  ctx.font = "300 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = GOLD;
  spaced(ctx, "PEDÍ EL TUYO EN", W / 2, H - 330, 10);
  ctx.font = "78px MaderoAnton, Impact, sans-serif";
  ctx.fillStyle = EMBER;
  ctx.fillText(fitText(ctx, opts.menuUrl.replace(/^https?:\/\//, "").toUpperCase(), W - 160), W / 2, H - 240);
  ctx.font = "56px MaderoElite, 'Courier New', monospace";
  ctx.fillStyle = CREAM;
  ctx.fillText(`@${INSTAGRAM_HANDLE}`, W / 2, H - 150);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo armar la imagen"))), "image/png")
  );
}

export type ShareResult = { kind: "shared" } | { kind: "cancelled" } | { kind: "preview"; url: string };

// Abre el menú de compartir del celular con la imagen. Si el navegador no puede compartir
// archivos (por ejemplo, en una computadora), devuelve la imagen para mostrarla y descargarla.
export async function shareOrderCard(opts: { items: ShareCardItem[]; seed: string; menuUrl: string }): Promise<ShareResult> {
  const blob = await renderShareCard(opts);
  const file = new File([blob], "mi-pedido-madero.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: `Hoy pedí en Madero 🍔 @${INSTAGRAM_HANDLE}` });
      return { kind: "shared" };
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return { kind: "cancelled" };
    }
  }
  return { kind: "preview", url: URL.createObjectURL(blob) };
}
