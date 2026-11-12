// Imagen tamaño historia (1080×1920) para que el cliente comparta su pedido en Instagram,
// WhatsApp o Facebook. Se dibujan en el celular del cliente (canvas): no usan la base ni el
// servidor, y no llevan nombre ni teléfono: es la foto que saca el cliente de su comida, con el
// marco de Madero.
import { INSTAGRAM_HANDLE } from "@/lib/brand";

const W = 1080;
const H = 1920;
const CREAM = "#efe3cc";
const GOLD = "#d6b480";
const EMBER = "#e58a3c";
const BG = "#1a110b";

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

function cleanUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "").toUpperCase();
}

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
