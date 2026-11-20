import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { getMenuHighlights, getMenuItems } from "@/lib/menu";
import { getPool } from "@/lib/admin/db";
import { loadFudoHistory } from "@/lib/admin/product-sales";
import { isDbConfigured } from "@/lib/admin/db";
import { listRewards } from "@/lib/admin/loyalty";
import { MENU_URL } from "@/lib/order-messages";
import { INSTAGRAM_HANDLE } from "@/lib/brand";
import type { MenuItem } from "@/lib/types";

// "Madero TV": pantalla para la tele del local (/tv). Muestra los flyers que se dejan en una
// carpeta de la PC, productos destacados con su precio real, el especial del día, la
// fidelidad y un QR al menú online. Todo es información pública del menú: nada de caja ni de
// clientes.

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
// Categorías que no se muestran como destacados (bebidas, salsas, vajilla, combos…).
const NOT_FEATURED = /bebida|salsa|vajilla|extra|aderezo|combo|promo/i;
// Productos que tampoco van como destacados aunque estén en Burger o Pizzas (los combos).
const NOT_FEATURED_NAME = /combo|promo/i;

// Carpeta de flyers de la tele: en la carpeta del usuario de Windows (como las copias de
// seguridad), así las actualizaciones del sistema nunca la tocan.
export function tvDir(): string {
  return process.env.MADERO_TV_DIR?.trim() || path.join(os.homedir(), "MaderoSys-TV");
}

export function ensureTvDir(): string | null {
  if (process.env.VERCEL) return null;
  const dir = tvDir();
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, "LEEME.txt"),
        "Dejá acá los flyers (JPG o PNG) que querés mostrar en la tele del local (Madero TV).\r\n" +
          "Se muestran en orden de nombre. Para sacar uno, borralo de esta carpeta.\r\n"
      );
    }
    return dir;
  } catch {
    return null;
  }
}

export interface TvFlyer {
  name: string;
  url: string;
}

export function listTvFlyers(): TvFlyer[] {
  const dir = ensureTvDir();
  if (!dir) return [];
  try {
    return readdirSync(dir)
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()) && !f.startsWith("."))
      .sort((a, b) => a.localeCompare(b, "es"))
      .slice(0, 40)
      .map((f) => {
        const v = Math.floor(statSync(path.join(dir, f)).mtimeMs);
        return { name: f, url: `/api/tv/flyer/${encodeURIComponent(f)}?v=${v}` };
      });
  } catch {
    return [];
  }
}

// Nombre de archivo seguro dentro de la carpeta (sin rutas ni "..").
export function resolveTvFlyer(name: string): string | null {
  const base = path.basename(name);
  if (base !== name || base.startsWith(".") || !IMAGE_EXT.has(path.extname(base).toLowerCase())) return null;
  const dir = tvDir();
  const full = path.join(dir, base);
  return existsSync(full) ? full : null;
}

// ---------- Subir y borrar flyers desde el panel ----------

export const MAX_FLYER_BYTES = 15 * 1024 * 1024;

// Tipo de imagen según los primeros bytes (no se confía en el nombre del archivo).
function imageExt(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ".png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return ".gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return ".webp";
  return null;
}

// Nombre prolijo y seguro: sin rutas ni caracteres raros, con la extensión del tipo real.
export function safeFlyerName(original: string, ext: string): string {
  const base = path
    .basename(original || "flyer")
    .replace(/\.[^.]*$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "flyer"}${ext}`;
}

export function saveTvFlyer(originalName: string, bytes: Uint8Array): TvFlyer {
  const dir = ensureTvDir();
  if (!dir) throw new Error("Los flyers de la tele se cargan desde la PC del local.");
  if (bytes.length === 0) throw new Error("El archivo está vacío.");
  if (bytes.length > MAX_FLYER_BYTES) throw new Error("La imagen es muy pesada (máximo 15 MB).");
  const ext = imageExt(bytes);
  if (!ext) throw new Error("Solo se pueden subir imágenes JPG, PNG, WEBP o GIF.");
  // Si ya hay uno con ese nombre: "nombre-2", "nombre-3"… (nunca se pisa otro flyer).
  const first = safeFlyerName(originalName, ext);
  const stem = first.slice(0, -ext.length);
  let name = first;
  for (let i = 2; existsSync(path.join(dir, name)) && i < 1000; i++) name = `${stem}-${i}${ext}`;
  if (existsSync(path.join(dir, name))) throw new Error("Hay demasiados flyers con ese nombre.");
  writeFileSync(path.join(dir, name), bytes);
  return listTvFlyers().find((f) => f.name === name) ?? { name, url: `/api/tv/flyer/${encodeURIComponent(name)}` };
}

export function deleteTvFlyer(name: string): boolean {
  const file = resolveTvFlyer(name);
  if (!file) return false;
  unlinkSync(file);
  return true;
}

export interface TvProduct {
  name: string;
  price: number;
  category: string;
}

export interface TvData {
  featured: TvProduct[];
  /** "popular": los más pedidos; "recomendados": rotación del día (sin ventas suficientes). */
  featuredKind: "popular" | "recomendados";
  /** "¿Ya los probaste?": de lo que se pide menos, para animar a probar (rota cada día). */
  toTry: TvProduct[];
  /** also: segundo producto del especial (opcional), con su precio. */
  special: (TvProduct & { text: string; imageUrl: string | null; also: TvProduct | null }) | null;
  rewards: { code: string; name: string; firstMilestone: number }[];
  menuUrl: string;
  instagram: string;
  qrMenu: string;
  qrFidelidad: string;
  flyers: TvFlyer[];
}

// Rotación del día: el mismo día muestra los mismos destacados, al día siguiente cambian.
function dailyPick(items: MenuItem[], count: number, day: string): MenuItem[] {
  let seed = 0;
  for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const scored = items.map((it, i) => ({ it, k: ((seed + 1) * (i + 7) * 2654435761) % 4294967296 }));
  return scored.sort((a, b) => a.k - b.k).slice(0, count).map((x) => x.it);
}

// Destacados mezclados: 2 burgers, 2 pizzas y 2 empanadas, intercalados.
const MIX: RegExp[] = [/burg/i, /^pizza/i, /empanad/i];
const SALES_WINDOW_DAYS = 120;
// Un producto nuevo se mide desde que empezó a venderse (con un mínimo de días, para que un
// par de ventas sueltas no lo pongan primero).
const MIN_RATE_DAYS = 14;

const norm = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

// Ventas por día de cada producto en los últimos meses: el historial de Fudo (hasta su último
// día) más lo cobrado en MaderoSys después, sin contar dos veces un mismo día. Así lo que se
// vende de verdad manda, aunque MaderoSys todavía tenga pocas ventas. Clave: nombre normalizado.
export async function salesRates(now: Date = new Date()): Promise<Map<string, number>> {
  const today = dayKey(now);
  const from = dayKey(new Date(now.getTime() - SALES_WINDOW_DAYS * 86_400_000));
  const stats = new Map<string, { qty: number; first: string }>();
  const add = (name: string, qty: number, day: string) => {
    const key = norm(name);
    const cur = stats.get(key) ?? { qty: 0, first: day };
    cur.qty += qty;
    if (day < cur.first) cur.first = day;
    stats.set(key, cur);
  };
  const history = loadFudoHistory();
  for (const [day, , , product, qty] of history.rows) {
    if (day >= from && day <= today) add(product, Number(qty), day);
  }
  if (isDbConfigured()) {
    // Lo del sistema, desde el día siguiente al último del historial (o desde el inicio de la ventana).
    const since = history.to && history.to >= from ? new Date(`${history.to}T23:59:59.999-03:00`) : new Date(`${from}T00:00:00-03:00`);
    try {
      const { rows } = await getPool().query<{ product_name: string; qty: number; closed_at: string | Date }>(
        `select oi.product_name, oi.qty, o.closed_at
         from gestion_order_items oi join gestion_orders o on o.id = oi.order_id
         where o.status = 'cerrada' and o.closed_at >= $1`,
        [since.toISOString()]
      );
      for (const r of rows) add(r.product_name, Number(r.qty), dayKey(new Date(r.closed_at)));
    } catch {
      // sin ventas del sistema: alcanza con el historial
    }
  }
  const rates = new Map<string, number>();
  for (const [key, st] of stats) rates.set(key, st.qty / Math.max(MIN_RATE_DAYS, daysBetween(st.first, today) + 1));
  return rates;
}

const rateOf = (rates: Map<string, number>, item: MenuItem) => rates.get(norm(item.name)) ?? 0;

// Intercala los grupos (burger, pizza, empanada, burger…) y completa con otros si falta alguno.
function interleave(groups: MenuItem[][], perGroup: number, fill: MenuItem[], exclude = new Set<string>()): MenuItem[] {
  const out: MenuItem[] = [];
  const used = new Set(exclude);
  for (let i = 0; i < perGroup; i++) {
    for (const g of groups) {
      const it = g.filter((x) => !used.has(x.id))[0];
      if (it) {
        used.add(it.id);
        out.push(it);
      }
    }
  }
  for (const it of fill) {
    if (out.length >= perGroup * groups.length) break;
    if (!used.has(it.id)) {
      used.add(it.id);
      out.push(it);
    }
  }
  return out;
}

// "Los favoritos": lo que más se vende por día de cada grupo. Sin ventas, una rotación del día.
export function mixFeatured(candidates: MenuItem[], rates: Map<string, number>, day: string, perGroup = 2): MenuItem[] {
  const byRate = (list: MenuItem[], seed: string) =>
    [...dailyPick(list, list.length, seed)].sort((a, b) => rateOf(rates, b) - rateOf(rates, a));
  const groups = MIX.map((re) => byRate(candidates.filter((i) => re.test(i.category)), day + re.source));
  return interleave(groups, perGroup, byRate(candidates, day));
}

// "¿Ya los probaste?": de la mitad que menos se vende de cada grupo, una selección que cambia
// cada día (sin repetir los favoritos de la otra pantalla).
export function mixToTry(candidates: MenuItem[], rates: Map<string, number>, day: string, exclude: MenuItem[], perGroup = 2): MenuItem[] {
  const lessSold = (list: MenuItem[]) => {
    const sorted = [...list].sort((a, b) => rateOf(rates, a) - rateOf(rates, b));
    return sorted.slice(0, Math.max(perGroup, Math.ceil(sorted.length / 2)));
  };
  const groups = MIX.map((re) => dailyPick(lessSold(candidates.filter((i) => re.test(i.category))), 99, `${day}-probar-${re.source}`));
  const fill = dailyPick(lessSold(candidates), 99, `${day}-probar`);
  return interleave(groups, perGroup, fill, new Set(exclude.map((i) => i.id)));
}

const qr = (text: string) =>
  QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a110bff", light: "#efe3ccff" } });

export async function getTvData(now: Date = new Date()): Promise<TvData> {
  const items = await getMenuItems();
  const highlights = await getMenuHighlights(items);
  const byId = new Map(items.map((i) => [i.id, i]));
  const candidates = items.filter((i) => !NOT_FEATURED.test(i.category) && !NOT_FEATURED_NAME.test(i.name));
  const day = dayKey(now);
  const rates = await salesRates(now);
  const withSales = candidates.filter((i) => rateOf(rates, i) > 0).length;
  const featuredItems = mixFeatured(candidates, rates, day);
  const toTryItems = mixToTry(candidates, rates, day, featuredItems);

  const specialItem = highlights?.special ? byId.get(highlights.special.id) : undefined;
  const alsoItem = highlights?.special?.id2 ? byId.get(highlights.special.id2) : undefined;
  const rewards = isDbConfigured()
    ? (await listRewards().catch(() => []))
        .filter((r) => r.active)
        .map((r) => ({ code: r.code, name: r.name, firstMilestone: r.firstMilestone }))
        .sort((a, b) => a.firstMilestone - b.firstMilestone)
    : [];

  return {
    featured: featuredItems.map((i) => ({ name: i.name, price: i.price, category: i.category })),
    featuredKind: withSales >= 6 ? "popular" : "recomendados",
    toTry: toTryItems.map((i) => ({ name: i.name, price: i.price, category: i.category })),
    special: specialItem
      ? {
          name: specialItem.name,
          price: specialItem.price,
          category: specialItem.category,
          text: highlights?.special?.text ?? "",
          imageUrl: highlights?.special?.imageUrl ?? null,
          also: alsoItem ? { name: alsoItem.name, price: alsoItem.price, category: alsoItem.category } : null,
        }
      : null,
    rewards,
    menuUrl: MENU_URL,
    instagram: INSTAGRAM_HANDLE,
    qrMenu: await qr(MENU_URL),
    qrFidelidad: await qr(`${MENU_URL}/fidelidad`),
    flyers: listTvFlyers(),
  };
}
