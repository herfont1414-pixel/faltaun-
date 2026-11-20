import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { getMenuHighlights, getMenuItems } from "@/lib/menu";
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
// Categorías que no se muestran como destacados (bebidas, salsas, vajilla…).
const NOT_FEATURED = /bebida|salsa|vajilla|extra|aderezo/i;

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

export interface TvCartaCategory {
  category: string;
  items: { name: string; price: number }[];
}

export interface TvData {
  featured: TvProduct[];
  /** La carta por categorías (solo lo disponible), para las pantallas de precios. */
  carta: TvCartaCategory[];
  /** "popular": los más pedidos; "recomendados": rotación del día (sin ventas suficientes). */
  featuredKind: "popular" | "recomendados";
  special: (TvProduct & { text: string; imageUrl: string | null }) | null;
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

// Destacados mezclados: 2 burgers, 2 pizzas y 2 empanadas (los más pedidos de cada una si hay
// ventas; si no, una rotación del día), intercalados. Si falta alguna, se completa con otros.
const MIX: RegExp[] = [/burg/i, /^pizza/i, /empanad/i];

export function mixFeatured(candidates: MenuItem[], popular: MenuItem[], day: string, perGroup = 2): MenuItem[] {
  const popularRank = new Map(popular.map((p, i) => [p.id, i]));
  const groups = MIX.map((re) => {
    const inGroup = candidates.filter((i) => re.test(i.category));
    const sold = inGroup.filter((i) => popularRank.has(i.id)).sort((a, b) => popularRank.get(a.id)! - popularRank.get(b.id)!);
    const rest = dailyPick(inGroup.filter((i) => !popularRank.has(i.id)), inGroup.length, day + re.source);
    return [...sold, ...rest].slice(0, perGroup);
  });
  const out: MenuItem[] = [];
  for (let i = 0; i < perGroup; i++) for (const g of groups) if (g[i]) out.push(g[i]);
  const total = perGroup * MIX.length;
  if (out.length < total) {
    const used = new Set(out.map((i) => i.id));
    const fill = [...popular, ...dailyPick(candidates, candidates.length, day)].filter((i) => !used.has(i.id) && !NOT_FEATURED.test(i.category));
    for (const it of fill) {
      if (out.length >= total) break;
      if (!used.has(it.id)) {
        used.add(it.id);
        out.push(it);
      }
    }
  }
  return out;
}

// Categorías que no van a la carta de la tele.
const NOT_IN_CARTA = /salsa|vajilla|extra|aderezo|delivery|^v$/i;

export function buildCarta(items: MenuItem[]): TvCartaCategory[] {
  const out: TvCartaCategory[] = [];
  for (const it of items) {
    if (NOT_IN_CARTA.test(it.category)) continue;
    let cat = out.find((c) => c.category === it.category);
    if (!cat) out.push((cat = { category: it.category, items: [] }));
    cat.items.push({ name: it.name, price: it.price });
  }
  // Bebidas al final (son muchas): primero la comida.
  return [...out.filter((c) => !/bebida/i.test(c.category)), ...out.filter((c) => /bebida/i.test(c.category))];
}

const qr = (text: string) =>
  QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a110bff", light: "#efe3ccff" } });

export async function getTvData(now: Date = new Date()): Promise<TvData> {
  const items = await getMenuItems();
  const highlights = await getMenuHighlights(items);
  const byId = new Map(items.map((i) => [i.id, i]));
  const candidates = items.filter((i) => !NOT_FEATURED.test(i.category));
  const popular = (highlights?.popularIds ?? []).map((id) => byId.get(id)).filter((i): i is MenuItem => !!i);
  const featuredItems = mixFeatured(candidates, popular, now.toISOString().slice(0, 10));

  const specialItem = highlights?.special ? byId.get(highlights.special.id) : undefined;
  const rewards = isDbConfigured()
    ? (await listRewards().catch(() => []))
        .filter((r) => r.active)
        .map((r) => ({ code: r.code, name: r.name, firstMilestone: r.firstMilestone }))
        .sort((a, b) => a.firstMilestone - b.firstMilestone)
    : [];

  return {
    featured: featuredItems.map((i) => ({ name: i.name, price: i.price, category: i.category })),
    featuredKind: popular.length >= 3 ? "popular" : "recomendados",
    carta: buildCarta(items),
    special: specialItem
      ? {
          name: specialItem.name,
          price: specialItem.price,
          category: specialItem.category,
          text: highlights?.special?.text ?? "",
          imageUrl: highlights?.special?.imageUrl ?? null,
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
