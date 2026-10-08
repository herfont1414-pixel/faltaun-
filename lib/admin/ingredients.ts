import { getPool } from "@/lib/admin/db";

export interface Ingredient {
  id: number;
  category: string | null;
  name: string;
  cost: number;
  supplier: string | null;
  unit: string;
  active: boolean;
}

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

function mapRow(row: any): Ingredient {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    cost: money(row.cost),
    supplier: row.supplier,
    unit: row.unit,
    active: row.active,
  };
}

export async function listIngredients(): Promise<Ingredient[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select * from gestion_ingredients where active = true order by category, name"
  );
  return rows.map(mapRow);
}

export async function updateIngredientCost(id: number, cost: number): Promise<Ingredient> {
  if (!Number.isFinite(cost) || cost < 0) throw new Error("El costo tiene que ser un número válido");
  const pool = getPool();
  const { rows: current } = await pool.query<{ cost: string | number }>(
    "select cost from gestion_ingredients where id = $1",
    [id]
  );
  if (!current[0]) throw new Error("Ingrediente no encontrado");

  const { rows } = await pool.query(
    "update gestion_ingredients set cost = $2, updated_at = now() where id = $1 returning *",
    [id, cost]
  );
  if (money(current[0].cost) !== cost) {
    await pool.query("insert into gestion_ingredient_price_history (ingredient_id, cost) values ($1, $2)", [
      id,
      cost,
    ]);
  }
  return mapRow(rows[0]);
}

export async function getIngredientPriceHistory(id: number) {
  const pool = getPool();
  const { rows } = await pool.query<{ cost: string | number; created_at: string }>(
    "select cost, created_at from gestion_ingredient_price_history where ingredient_id = $1 order by created_at asc",
    [id]
  );
  return rows.map((r) => ({ cost: money(r.cost), createdAt: r.created_at }));
}
