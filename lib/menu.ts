import { getPool, isDbConfigured } from "@/lib/admin/db";
import { sampleMenu } from "@/lib/data/sample-menu";
import type { MenuItem } from "@/lib/types";

export async function getMenuItems(): Promise<MenuItem[]> {
  if (!isDbConfigured()) {
    return sampleMenu;
  }

  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    name: string;
    price: string;
    category_name: string;
  }>(`
    select p.id, p.name, p.price, c.name as category_name
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
  }));
}
