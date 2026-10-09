import { getPool, isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { sampleMenu } from "@/lib/data/sample-menu";
import type { MenuItem } from "@/lib/types";

export async function getMenuItems(): Promise<MenuItem[]> {
  if (!isDbConfigured()) {
    return sampleMenu;
  }

  try {
    await ensureSeeded();
    const pool = getPool();
    const { rows } = await pool.query<{
      id: number;
      name: string;
      price: string;
      category_name: string;
      in_stock: boolean;
    }>(`
      select p.id, p.name, p.price, p.in_stock, c.name as category_name
      from gestion_products p
      join gestion_categories c on c.id = p.category_id
      where p.active = true
      order by c.sort_order, p.name
    `);

    if (rows.length === 0) return sampleMenu;

    return rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      description: "",
      price: parseFloat(r.price),
      image_url: null,
      category: r.category_name,
      featured: false,
      inStock: r.in_stock,
    }));
  } catch {
    return sampleMenu;
  }
}

// Destacados del menú público. Todo se calcula con datos que ya existen (ventas
// cerradas y la tabla gestion_meta): sin cambios de esquema.
export interface MenuHighlights {
  // Ids de los productos más pedidos, del primero al último.
  popularIds: string[];
  // Especial del día activo (producto + texto breve), o null si no hay.
  special: { id: string; text: string } | null;
}

const POPULAR_MAX = 6;
// Con menos productos con ventas que esto, la sección no se muestra: no se inventa un ranking.
const POPULAR_MIN = 3;
// Se mira lo vendido en los últimos pedidos cerrados, así el ranking sigue a la carta actual.
const POPULAR_WINDOW = 500;
// Adicionales (salsa extra, doble carne…): venden mucho pero no son "lo más pedido".
const EXTRA_NAME = /extra|adicional|doble carne/i;

export async function getMenuHighlights(items: MenuItem[]): Promise<MenuHighlights | null> {
  if (!isDbConfigured()) return null;
  try {
    const pool = getPool();
    const byName = new Map(items.map((i) => [i.name, i]));

    const { rows: sold } = await pool.query<{ product_name: string }>(
      `select oi.product_name, sum(oi.qty) as total
       from gestion_order_items oi
       where oi.order_id in (
         select id from gestion_orders where status = 'cerrada' order by closed_at desc limit ${POPULAR_WINDOW}
       )
       group by oi.product_name
       order by sum(oi.qty) desc, oi.product_name
       limit 30`
    );
    const ranked = sold
      .map((r) => byName.get(r.product_name))
      .filter((i): i is MenuItem => !!i && i.inStock && !EXTRA_NAME.test(i.name));
    const popularIds = ranked.length >= POPULAR_MIN ? ranked.slice(0, POPULAR_MAX).map((i) => i.id) : [];

    const { rows: meta } = await pool.query<{ key: string; value: string | null }>(
      "select key, value from gestion_meta where key in ('menu_special_active', 'menu_special_id', 'menu_special_text')"
    );
    const cfg = Object.fromEntries(meta.map((m) => [m.key, m.value ?? ""]));
    const special =
      cfg.menu_special_active === "1" && cfg.menu_special_id && items.some((i) => i.id === cfg.menu_special_id)
        ? { id: cfg.menu_special_id, text: (cfg.menu_special_text ?? "").trim().slice(0, 140) }
        : null;

    return { popularIds, special };
  } catch {
    // Los destacados son un extra: si algo falla, el menú se muestra igual, sin ellos.
    return null;
  }
}
