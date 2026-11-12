// Imágenes tamaño historia (1080×1920) para que el cliente comparta su pedido en Instagram,
// WhatsApp o Facebook. Se dibujan en el celular del cliente (canvas): no usan la base ni el
// servidor, y no llevan nombre ni teléfono. Dos estilos:
//  - "foto": la foto que saca el cliente de su comida, con el marco de Madero.
//  - "ticket": una comanda de papel con lo que pidió y la calificación.
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
const INK = "#2a1a10";

// Líneas del pedido: hasta `max` productos y "y N más". Exportada para probarla sin canvas.
export function itemLines(items: ShareCardItem[], max = 5): string[] {
  const lines = items.slice(0, max).map((it) => `${it.qty}x ${it.name}`);
  const rest = items.length - max;
  if (rest > 0) lines.push(`y ${rest} ${rest === 1 ? "producto" : "productos"} más`);
  return lines;
}

function seedOf(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
  return h || 11;
}

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

async function ready() {
  if (document.fonts) {
    await Promise.all([document.fonts.load("120px MaderoAnton"), document.fonts.load("52px MaderoElite")]).catch(() => {});
  }
  return loadImage("/brand/madero-logo-crema.png");
}

function newCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  return { canvas, ctx };
}

function toBlob(canvas: HTMLCanvasElement, type = "image/jpeg"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo armar la imagen"))), type, 0.92)
  );
}

// Texto con separación entre letras (letterSpacing de canvas no anda en todos los celulares).
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  chars.forEach((ch, i) => {
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

// Título con textura gastada (como los flyers): se escribe en una capa y se le comen puntitos.
function grunge(text: string, px: number, color: string, width: number, height: number, seed: number) {
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const l = layer.getContext("2d")!;
  let size = px;
  l.font = `${size}px MaderoAnton, Impact, sans-serif`;
  while (l.measureText(text).width > width - 30 && size > 40) {
    size -= 4;
    l.font = `${size}px MaderoAnton, Impact, sans-serif`;
  }
  l.fillStyle = color;
  l.textAlign = "center";
  l.textBaseline = "middle";
  l.fillText(text, width / 2, height / 2);
  l.globalCompositeOperation = "destination-out";
  const rand = rng(seed);
  for (let i = 0; i < (width * height) / 160; i++) {
    l.globalAlpha = 0.35 + rand() * 0.65;
    l.fillRect(rand() * width, rand() * height, 1 + rand() * 3, 1 + rand() * 3);
  }
  return layer;
}

// Logo de un color cualquiera (el archivo es crema sobre transparente).
function tinted(logo: HTMLImageElement, color: string) {
  const c = document.createElement("canvas");
  c.width = logo.width;
  c.height = logo.height;
  const x = c.getContext("2d")!;
  x.drawImage(logo, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

function cleanUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "").toUpperCase();
}

// ---------------------------------------------------------------------------------------------
// Estilo 1: la foto del cliente con el marco de Madero
// ---------------------------------------------------------------------------------------------

export async function renderPhotoCard(opts: { photo: Blob; seed: string; menuUrl: string }): Promise<Blob> {
  const logo = await ready();
  const url = URL.createObjectURL(opts.photo);
  let photo: HTMLImageElement;
  try {
    photo = await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const { canvas, ctx } = newCanvas();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // La foto cubre todo (se recorta lo que sobra, centrada).
  const scale = Math.max(W / photo.width, H / photo.height);
  const pw = photo.width * scale;
  const ph = photo.height * scale;
  ctx.drawImage(photo, (W - pw) / 2, (H - ph) / 2, pw, ph);

  // Tono cálido de los flyers y bordes oscuros para que se lean el logo y los textos.
  ctx.fillStyle = "rgba(217,123,63,0.12)";
  ctx.fillRect(0, 0, W, H);
  const top = ctx.createLinearGradient(0, 0, 0, 640);
  top.addColorStop(0, "rgba(20,12,7,0.92)");
  top.addColorStop(0.55, "rgba(20,12,7,0.45)");
  top.addColorStop(1, "rgba(20,12,7,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 640);
  const bottom = ctx.createLinearGradient(0, H - 860, 0, H);
  bottom.addColorStop(0, "rgba(20,12,7,0)");
  bottom.addColorStop(0.45, "rgba(20,12,7,0.7)");
  bottom.addColorStop(1, "rgba(20,12,7,0.96)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H - 860, W, 860);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(239,227,204,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(46, 46, W - 92, H - 92);

  const logoW = 400;
  ctx.drawImage(logo, (W - logoW) / 2, 110, logoW, (logo.height / logo.width) * logoW);

  const seed = seedOf(opts.seed);
  ctx.drawImage(grunge("HOY CENÉ EN MADERO", 150, CREAM, W - 120, 210, seed), 60, H - 560);
  ctx.font = "50px MaderoElite, 'Courier New', monospace";
  ctx.fillStyle = CREAM;
  ctx.fillText("¿Y vos qué vas a pedir?", W / 2, H - 290);
  ctx.font = "62px MaderoAnton, Impact, sans-serif";
  ctx.fillStyle = EMBER;
  ctx.fillText(fitText(ctx, cleanUrl(opts.menuUrl), W - 200), W / 2, H - 200);
  ctx.font = "300 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = GOLD;
  spaced(ctx, `@${INSTAGRAM_HANDLE.toUpperCase()}`, W / 2, H - 125, 8);
  return toBlob(canvas);
}

// ---------------------------------------------------------------------------------------------
// Estilo 3: comanda de papel con el pedido y la calificación
// ---------------------------------------------------------------------------------------------

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

function dashed(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(42,26,16,0.55)";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

export async function renderTicketCard(opts: {
  items: ShareCardItem[];
  seed: string;
  reference: string;
  date: Date;
  menuUrl: string;
}): Promise<Blob> {
  const logo = await ready();
  const { canvas, ctx } = newCanvas();
  const seed = seedOf(opts.seed);
  const rand = rng(seed);

  // Fondo de madera oscura (vetas suaves) con luz cálida.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 6) {
    ctx.fillStyle = `rgba(120,70,35,${0.04 + rand() * 0.07})`;
    ctx.fillRect(0, y, W, 2 + rand() * 3);
  }
  const glow = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 1000);
  glow.addColorStop(0, "rgba(217,123,63,0.30)");
  glow.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.font = "300 42px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = GOLD;
  spaced(ctx, "HOY PEDÍ EN MADERO", W / 2, 120, 10);

  // El papel: alto según la cantidad de productos.
  const lines = itemLines(opts.items, 4);
  const logoW = 340;
  const logoH = (logo.height / logo.width) * logoW;
  const paperW = 860;
  // Alto justo para el contenido (ver los saltos de "y" más abajo).
  const paperH = 70 + logoH + 70 + 54 + 50 + 80 + lines.length * 70 + 4 + 90 + 80 + 100 + 110 + 140 + 60;
  const px = (W - paperW) / 2;
  const py = 180;
  ctx.save();
  ctx.translate(W / 2, py + paperH / 2);
  ctx.rotate(-0.025);
  ctx.translate(-W / 2, -(py + paperH / 2));
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  // Bordes de papel cortado (zigzag arriba y abajo).
  const tooth = 26;
  ctx.beginPath();
  ctx.moveTo(px, py + 14);
  for (let x = px; x < px + paperW; x += tooth) {
    ctx.lineTo(x + tooth / 2, py);
    ctx.lineTo(x + tooth, py + 14);
  }
  ctx.lineTo(px + paperW, py + paperH - 14);
  for (let x = px + paperW; x > px; x -= tooth) {
    ctx.lineTo(x - tooth / 2, py + paperH);
    ctx.lineTo(x - tooth, py + paperH - 14);
  }
  ctx.closePath();
  ctx.fillStyle = "#f4ead6";
  ctx.fill();
  ctx.shadowColor = "transparent";
  // Granito del papel.
  ctx.clip();
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = `rgba(90,60,30,${0.03 + rand() * 0.06})`;
    ctx.fillRect(px + rand() * paperW, py + rand() * paperH, 2, 2);
  }

  const cx = W / 2;
  let y = py + 70;
  ctx.drawImage(tinted(logo, INK), cx - logoW / 2, y, logoW, logoH);
  y += logoH + 70;

  ctx.fillStyle = INK;
  ctx.font = "44px MaderoElite, 'Courier New', monospace";
  ctx.fillText(`COMANDA #${opts.reference}`, cx, y);
  y += 54;
  ctx.font = "36px MaderoElite, 'Courier New', monospace";
  ctx.fillStyle = "rgba(42,26,16,0.75)";
  ctx.fillText(
    opts.date.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }),
    cx,
    y
  );
  y += 50;
  dashed(ctx, px + 60, px + paperW - 60, y);
  y += 80;

  ctx.fillStyle = INK;
  ctx.font = "46px MaderoElite, 'Courier New', monospace";
  ctx.textAlign = "left";
  for (const line of lines) {
    ctx.fillText(fitText(ctx, line, paperW - 130), px + 65, y);
    y += 70;
  }
  ctx.textAlign = "center";
  y += 4;
  dashed(ctx, px + 60, px + paperW - 60, y);
  y += 90;

  ctx.font = "40px MaderoElite, 'Courier New', monospace";
  ctx.fillStyle = "rgba(42,26,16,0.8)";
  ctx.fillText("CALIFICACIÓN", cx, y);
  y += 80;
  ctx.fillStyle = EMBER;
  for (let i = 0; i < 5; i++) star(ctx, cx - 240 + i * 120, y - 20, 46);
  y += 100;
  ctx.drawImage(grunge("10/10 · VOLVERÍA", 96, INK, paperW - 80, 130, seed), px + 40, y - 70);
  y += 110;

  // "Código de barras" decorativo.
  const barsW = 520;
  let bx = cx - barsW / 2;
  ctx.fillStyle = INK;
  while (bx < cx + barsW / 2) {
    const w = 2 + Math.floor(rand() * 7);
    ctx.fillRect(bx, y, w, 90);
    bx += w + 3 + Math.floor(rand() * 7);
  }
  y += 140;
  ctx.font = "40px MaderoElite, 'Courier New', monospace";
  ctx.fillText(`@${INSTAGRAM_HANDLE}`, cx, y);
  ctx.restore();

  ctx.font = "300 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = GOLD;
  spaced(ctx, "PEDÍ EL TUYO EN", W / 2, H - 150, 10);
  ctx.font = "66px MaderoAnton, Impact, sans-serif";
  ctx.fillStyle = EMBER;
  ctx.fillText(fitText(ctx, cleanUrl(opts.menuUrl), W - 160), W / 2, H - 72);
  return toBlob(canvas);
}

// ---------------------------------------------------------------------------------------------

// ¿El celular puede compartir la imagen directo (Instagram, WhatsApp…)?
export function canShareImage(blob: Blob): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (!nav.share || !nav.canShare) return false;
  return nav.canShare({ files: [new File([blob], "madero.jpg", { type: blob.type })] });
}

// Abre el menú de compartir del celular. Se llama desde un toque del cliente (lo exigen los celulares).
export async function shareImage(blob: Blob): Promise<"shared" | "cancelled" | "failed"> {
  const file = new File([blob], blob.type === "image/png" ? "mi-pedido-madero.png" : "mi-pedido-madero.jpg", { type: blob.type });
  try {
    await navigator.share({ files: [file], text: `Hoy pedí en Madero 🍔 @${INSTAGRAM_HANDLE}` });
    return "shared";
  } catch (error) {
    return (error as Error)?.name === "AbortError" ? "cancelled" : "failed";
  }
}
