import { getPool } from "@/lib/admin/db";

// "Especial del día" del menú online. Se guarda en gestion_meta (clave/valor), la
// misma tabla que ya usa el sistema; lo lee getMenuHighlights() en lib/menu.ts.
export interface MenuSpecial {
  active: boolean;
  productId: number | null;
  // Segundo producto opcional que se muestra junto al primero (por ejemplo, dos pizzas nuevas).
  productId2: number | null;
  text: string;
}

const KEYS = ["menu_special_active", "menu_special_id", "menu_special_id2", "menu_special_text"] as const;
export const SPECIAL_TEXT_MAX = 140;

export async function getMenuSpecial(): Promise<MenuSpecial> {
  const pool = getPool();
  const { rows } = await pool.query<{ key: string; value: string | null }>(
    `select key, value from gestion_meta where key in ('${KEYS.join("', '")}')`
  );
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  const asId = (raw: string | undefined) => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  };
  return {
    active: cfg.menu_special_active === "1",
    productId: asId(cfg.menu_special_id),
    productId2: asId(cfg.menu_special_id2),
    text: cfg.menu_special_text ?? "",
  };
}

export async function setMenuSpecial(input: {
  active: boolean;
  productId: number | null;
  productId2?: number | null;
  text: string;
}): Promise<MenuSpecial> {
  const text = input.text.trim();
  if (text.length > SPECIAL_TEXT_MAX) {
    throw new Error(`El texto puede tener hasta ${SPECIAL_TEXT_MAX} caracteres`);
  }
  const pool = getPool();

  const productId2 = input.productId2 ?? null;
  for (const id of [input.productId, productId2]) {
    if (id === null) continue;
    if (!Number.isInteger(id)) throw new Error("Producto inválido");
    const { rows } = await pool.query<{ active: boolean }>("select active from gestion_products where id = $1", [id]);
    if (!rows[0]) throw new Error("El producto elegido no existe");
    if (!rows[0].active) throw new Error("El producto elegido está dado de baja");
  }
  if (input.active && input.productId === null) throw new Error("Elegí el producto del especial para activarlo");
  if (productId2 !== null && input.productId === null) throw new Error("Elegí primero el producto principal del especial");
  if (productId2 !== null && productId2 === input.productId) throw new Error("El segundo producto tiene que ser distinto del primero");

  const entries: [string, string][] = [
    ["menu_special_active", input.active ? "1" : "0"],
    ["menu_special_id", input.productId === null ? "" : String(input.productId)],
    ["menu_special_id2", productId2 === null ? "" : String(productId2)],
    ["menu_special_text", text],
  ];
  for (const [key, value] of entries) {
    await pool.query(
      `insert into gestion_meta (key, value) values ($1, $2)
       on conflict (key) do update set value = excluded.value`,
      [key, value]
    );
  }
  return { active: input.active, productId: input.productId, productId2, text };
}

// ---------- Foto del especial ----------
// La foto se guarda en gestion_meta como data URL (JPEG/PNG/WebP en base64), ya achicada
// en el navegador antes de subirla. Así funciona igual en Vercel y en la PC del local, sin
// servicios externos ni carpetas de archivos. Queda asociada al producto para el que se
// subió: si el especial pasa a ser otro producto, esa foto deja de mostrarse sola.
export const SPECIAL_IMAGE_MAX_CHARS = 2_000_000; // ≈1,5 MB de imagen
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export interface MenuSpecialImageInfo {
  version: string;
  productId: number | null;
  sizeKb: number;
}

async function putMeta(key: string, value: string) {
  await getPool().query(
    `insert into gestion_meta (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value`,
    [key, value]
  );
}

export async function setMenuSpecialImage(dataUrl: string, productId: number | null): Promise<MenuSpecialImageInfo> {
  if (typeof dataUrl !== "string" || !IMAGE_RE.test(dataUrl)) {
    throw new Error("La imagen tiene que ser una foto JPG, PNG o WebP");
  }
  if (dataUrl.length > SPECIAL_IMAGE_MAX_CHARS) throw new Error("La foto es demasiado pesada (máximo 1,5 MB)");
  if (productId !== null) {
    if (!Number.isInteger(productId)) throw new Error("Producto inválido");
    const { rows } = await getPool().query("select id from gestion_products where id = $1", [productId]);
    if (!rows[0]) throw new Error("El producto elegido no existe");
  }
  const version = String(Date.now());
  await putMeta("menu_special_image", dataUrl);
  await putMeta("menu_special_image_product", productId === null ? "" : String(productId));
  await putMeta("menu_special_image_v", version);
  return { version, productId, sizeKb: Math.round((dataUrl.length * 3) / 4 / 1024) };
}

export async function clearMenuSpecialImage() {
  await getPool().query(
    "delete from gestion_meta where key in ('menu_special_image', 'menu_special_image_product', 'menu_special_image_v')"
  );
}

// Datos de la foto sin traer la imagen (liviano).
export async function getMenuSpecialImageInfo(): Promise<MenuSpecialImageInfo | null> {
  const { rows } = await getPool().query<{ key: string; value: string | null }>(
    `select key, case when key = 'menu_special_image' then cast(length(value) as text) else value end as value
     from gestion_meta where key in ('menu_special_image', 'menu_special_image_product', 'menu_special_image_v')`
  );
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
  if (!cfg.menu_special_image || !cfg.menu_special_image_v) return null;
  const pid = Number(cfg.menu_special_image_product);
  return {
    version: cfg.menu_special_image_v,
    productId: cfg.menu_special_image_product && Number.isInteger(pid) ? pid : null,
    sizeKb: Math.round((Number(cfg.menu_special_image) * 3) / 4 / 1024),
  };
}

// La foto en sí, para servirla como imagen.
export async function getMenuSpecialImageData(): Promise<{ mime: string; data: Buffer } | null> {
  const { rows } = await getPool().query<{ value: string | null }>(
    "select value from gestion_meta where key = 'menu_special_image'"
  );
  const value = rows[0]?.value ?? "";
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(value);
  if (!match) return null;
  return { mime: match[1], data: Buffer.from(match[2], "base64") };
}
