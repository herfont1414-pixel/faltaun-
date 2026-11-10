import { getPool } from "@/lib/admin/db";

export interface PrintArea {
  id: number;
  nombre: string;
  /** false = lo de esta área no sale en la comanda de cocina (ej. Barra). */
  enComanda: boolean;
}

export async function listPrintAreas(): Promise<PrintArea[]> {
  const pool = getPool();
  const { rows } = await pool.query("select id, nombre, en_comanda from gestion_print_areas order by nombre");
  return rows.map((r: { id: number; nombre: string; en_comanda: unknown }) => ({
    id: Number(r.id),
    nombre: r.nombre,
    enComanda: Boolean(r.en_comanda),
  }));
}

export async function createPrintArea(nombre: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `insert into gestion_print_areas (nombre) values ($1) on conflict (nombre) do nothing`,
    [nombre]
  );
}

export async function deletePrintArea(id: number): Promise<void> {
  const pool = getPool();
  await pool.query("update gestion_products set print_area_id = null where print_area_id = $1", [id]);
  await pool.query("delete from gestion_print_areas where id = $1", [id]);
}

export async function setPrintAreaEnComanda(id: number, enComanda: boolean): Promise<void> {
  await getPool().query("update gestion_print_areas set en_comanda = $2 where id = $1", [id, enComanda]);
}
