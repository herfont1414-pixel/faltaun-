import { getPool } from "@/lib/admin/db";

export interface RecipeItem {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
}

export interface RecipeDetail {
  productId: number;
  productName: string;
  salePrice: number;
  items: RecipeItem[];
  costTotal: number;
  margin: number;
  marginPct: number | null;
}

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

export async function getRecipe(productId: number): Promise<RecipeDetail | null> {
  const pool = getPool();
  const { rows: productRows } = await pool.query<{ id: number; name: string; price: string | number }>(
    "select id, name, price from gestion_products where id = $1",
    [productId]
  );
  if (!productRows[0]) return null;
  const product = productRows[0];
  const salePrice = money(product.price);

  const { rows: itemRows } = await pool.query<{
    ingredient_id: number;
    quantity: string | number;
    name: string;
    unit: string;
    cost: string | number;
  }>(
    `select ri.ingredient_id, ri.quantity, i.name, i.unit, i.cost
     from gestion_recipes r
     join gestion_recipe_items ri on ri.recipe_id = r.id
     join gestion_ingredients i on i.id = ri.ingredient_id
     where r.product_id = $1
     order by i.name`,
    [productId]
  );

  const items: RecipeItem[] = itemRows.map((r) => {
    const quantity = money(r.quantity);
    const unitCost = money(r.cost);
    return {
      ingredientId: r.ingredient_id,
      ingredientName: r.name,
      unit: r.unit,
      quantity,
      unitCost,
      lineCost: quantity * unitCost,
    };
  });

  const costTotal = items.reduce((sum, it) => sum + it.lineCost, 0);
  const margin = salePrice - costTotal;
  const marginPct = salePrice > 0 ? (margin / salePrice) * 100 : null;

  return {
    productId: product.id,
    productName: product.name,
    salePrice,
    items,
    costTotal,
    margin,
    marginPct,
  };
}

export async function upsertRecipe(
  productId: number,
  items: { ingredientId: number; quantity: number }[]
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: number }>(
      `insert into gestion_recipes (product_id) values ($1)
       on conflict (product_id) do update set updated_at = now()
       returning id`,
      [productId]
    );
    const recipeId = rows[0].id;
    await client.query("delete from gestion_recipe_items where recipe_id = $1", [recipeId]);
    for (const item of items) {
      if (!item.ingredientId || !Number.isFinite(item.quantity) || item.quantity <= 0) continue;
      await client.query(
        "insert into gestion_recipe_items (recipe_id, ingredient_id, quantity) values ($1, $2, $3)",
        [recipeId, item.ingredientId, item.quantity]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
