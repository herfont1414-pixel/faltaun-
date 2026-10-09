import { getPool } from "@/lib/admin/db";

// "Especial del día" del menú online. Se guarda en gestion_meta (clave/valor), la
// misma tabla que ya usa el sistema; lo lee getMenuHighlights() en lib/menu.ts.
export interface MenuSpecial {
  active: boolean;
  productId: number | null;
  text: string;
}

const KEYS = ["menu_special_active", "menu_special_id", "menu_special_text"] as const;
export const SPECIAL_TEXT_MAX = 140;

export async function getMenuSpecial(): Promise<MenuSpecial> {
  const pool = getPool();
  const { rows } = await pool.query<{ key: string; value: string | null }>(
    `select key, value from gestion_meta where key in ('${KEYS.join("', '")}')`
  );
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  const id = Number(cfg.menu_special_id);
  return {
    active: cfg.menu_special_active === "1",
    productId: Number.isInteger(id) && id > 0 ? id : null,
    text: cfg.menu_special_text ?? "",
  };
}

export async function setMenuSpecial(input: { active: boolean; productId: number | null; text: string }): Promise<MenuSpecial> {
  const text = input.text.trim();
  if (text.length > SPECIAL_TEXT_MAX) {
    throw new Error(`El texto puede tener hasta ${SPECIAL_TEXT_MAX} caracteres`);
  }
  const pool = getPool();

  if (input.productId !== null) {
    if (!Number.isInteger(input.productId)) throw new Error("Producto inválido");
    const { rows } = await pool.query<{ active: boolean }>("select active from gestion_products where id = $1", [
      input.productId,
    ]);
    if (!rows[0]) throw new Error("El producto elegido no existe");
    if (!rows[0].active) throw new Error("El producto elegido está dado de baja");
  }
  if (input.active && input.productId === null) throw new Error("Elegí el producto del especial para activarlo");

  const entries: [string, string][] = [
    ["menu_special_active", input.active ? "1" : "0"],
    ["menu_special_id", input.productId === null ? "" : String(input.productId)],
    ["menu_special_text", text],
  ];
  for (const [key, value] of entries) {
    await pool.query(
      `insert into gestion_meta (key, value) values ($1, $2)
       on conflict (key) do update set value = excluded.value`,
      [key, value]
    );
  }
  return { active: input.active, productId: input.productId, text };
}
