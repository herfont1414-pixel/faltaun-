import { getPool } from "@/lib/admin/db";

export interface PrintArea {
  id: number;
  nombre: string;
}

export async function listPrintAreas(): Promise<PrintArea[]> {
  const pool = getPool();
  const { rows } = await pool.query("select id, nombre from gestion_print_areas order by nombre");
  return rows;
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
