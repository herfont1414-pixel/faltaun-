import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

export interface TvProduct {
  name: string;
  price: number;
  category: string;
}

export interface TvData {
  featured: TvProduct[];
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

const qr = (text: string) =>
  QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a110bff", light: "#efe3ccff" } });

export async function getTvData(now: Date = new Date()): Promise<TvData> {
  const items = await getMenuItems();
  const highlights = await getMenuHighlights(items);
  const byId = new Map(items.map((i) => [i.id, i]));
  const candidates = items.filter((i) => !NOT_FEATURED.test(i.category));
  const popular = (highlights?.popularIds ?? []).map((id) => byId.get(id)).filter((i): i is MenuItem => !!i);
  const featuredItems = popular.length >= 3 ? popular.slice(0, 6) : dailyPick(candidates, 6, now.toISOString().slice(0, 10));

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
