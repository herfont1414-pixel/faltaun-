import { getPool } from "@/lib/admin/db";

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
}

export async function listSuppliers(): Promise<Supplier[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select id, name, phone, address from gestion_suppliers where active = true order by name"
  );
  return rows;
}
