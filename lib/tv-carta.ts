import type { TvData } from "@/lib/tv";

// Páginas de la carta para Madero TV (sin dependencias del servidor: lo usa la pantalla).
export const CARTA_PER_PAGE = 14;

export interface CartaPage {
  category: string;
  page: number;
  pages: number;
  items: { name: string; price: number }[];
}

// Cada categoría en páginas de hasta 14 productos (dos columnas), repartidas parejo.
export function cartaPages(data: Pick<TvData, "carta">): CartaPage[] {
  const out: CartaPage[] = [];
  for (const c of data.carta) {
    if (!c.items.length) continue;
    const pages = Math.ceil(c.items.length / CARTA_PER_PAGE);
    const per = Math.ceil(c.items.length / pages);
    for (let i = 0; i < pages; i++) out.push({ category: c.category, page: i + 1, pages, items: c.items.slice(i * per, (i + 1) * per) });
  }
  return out;
}

