import { getPool } from "@/lib/admin/db";
import { recordStockMovement } from "@/lib/admin/stock-movements";
import type { PaymentMethod } from "@/lib/admin/types";

export interface PurchaseItemInput {
  ingredientId?: number | null;
  productId?: number | null;
  quantity: number;
  unitCost: number;
}

export interface Purchase {
  id: string;
  supplierId: number | null;
  supplierName: string | null;
  purchasedAt: string;
  paymentMethod: PaymentMethod;
  total: number;
  note: string | null;
  items: {
    ingredientId: number | null;
    productId: number | null;
    name: string;
    quantity: number;
    unitCost: number;
    lineTotal: number;
  }[];
}

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

export async function createPurchase(params: {
  supplierId: number | null;
  paymentMethod: PaymentMethod;
  note: string | null;
  userId: number;
  items: PurchaseItemInput[];
}): Promise<Purchase> {
  if (params.items.length === 0) throw new Error("Agregá al menos un ítem a la compra");
  for (const item of params.items) {
    if (!item.ingredientId && !item.productId) {
      throw new Error("Cada ítem necesita un ingrediente o un producto");
    }
    if (item.ingredientId && item.productId) {
      throw new Error("Un ítem no puede ser ingrediente y producto a la vez");
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error("La cantidad tiene que ser mayor a cero");
    }
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) {
      throw new Error("El costo unitario tiene que ser un número válido");
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const total = params.items.reduce((sum, it) => sum + it.quantity * it.unitCost, 0);
    const { rows: purchaseRows } = await client.query<{ id: string }>(
      `insert into gestion_purchases (supplier_id, payment_method, total, note, user_id)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [params.supplierId, params.paymentMethod, total, params.note, params.userId]
    );
    const purchaseId = purchaseRows[0].id;

    for (const item of params.items) {
      const lineTotal = item.quantity * item.unitCost;
      await client.query(
        `insert into gestion_purchase_items (purchase_id, ingredient_id, product_id, quantity, unit_cost, line_total)
         values ($1, $2, $3, $4, $5, $6)`,
        [purchaseId, item.ingredientId ?? null, item.productId ?? null, item.quantity, item.unitCost, lineTotal]
      );

      if (item.ingredientId) {
        const { rows } = await client.query<{ cost: string | number; track_stock: boolean; stock_qty: number | null }>(
          "select cost, track_stock, stock_qty from gestion_ingredients where id = $1 for update",
          [item.ingredientId]
        );
        const ingredient = rows[0];
        if (!ingredient) throw new Error("Ingrediente no encontrado");

        const newStockQty = ingredient.track_stock ? (ingredient.stock_qty ?? 0) + item.quantity : ingredient.stock_qty;
        await client.query("update gestion_ingredients set cost = $2, stock_qty = $3, updated_at = now() where id = $1", [
          item.ingredientId,
          item.unitCost,
          newStockQty,
        ]);
        if (money(ingredient.cost) !== item.unitCost) {
          await client.query(
            "insert into gestion_ingredient_price_history (ingredient_id, cost) values ($1, $2)",
            [item.ingredientId, item.unitCost]
          );
        }
        await recordStockMovement(
          {
            ingredientId: item.ingredientId,
            type: "compra",
            quantity: item.quantity,
            referenceType: "purchase",
            referenceId: purchaseId,
            userId: params.userId,
          },
          client
        );
      } else if (item.productId) {
        const { rows } = await client.query<{ stock_qty: number | null }>(
          "select stock_qty from gestion_products where id = $1 for update",
          [item.productId]
        );
        if (!rows[0]) throw new Error("Producto no encontrado");
        const newStockQty = (rows[0].stock_qty ?? 0) + item.quantity;
        await client.query("update gestion_products set stock_qty = $2, in_stock = true where id = $1", [
          item.productId,
          newStockQty,
        ]);
        await recordStockMovement(
          {
            productId: item.productId,
            type: "compra",
            quantity: item.quantity,
            referenceType: "purchase",
            referenceId: purchaseId,
            userId: params.userId,
          },
          client
        );
      }
    }

    await client.query("commit");
    return (await getPurchase(purchaseId))!;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPurchase(id: string): Promise<Purchase | null> {
  const pool = getPool();
  const { rows: purchaseRows } = await pool.query(
    `select p.*, s.name as supplier_name from gestion_purchases p
     left join gestion_suppliers s on s.id = p.supplier_id
     where p.id = $1`,
    [id]
  );
  if (!purchaseRows[0]) return null;
  const p = purchaseRows[0];

  const { rows: itemRows } = await pool.query(
    `select pi.ingredient_id, pi.product_id, pi.quantity, pi.unit_cost, pi.line_total,
            coalesce(i.name, pr.name) as name
     from gestion_purchase_items pi
     left join gestion_ingredients i on i.id = pi.ingredient_id
     left join gestion_products pr on pr.id = pi.product_id
     where pi.purchase_id = $1`,
    [id]
  );

  return {
    id: p.id,
    supplierId: p.supplier_id,
    supplierName: p.supplier_name,
    purchasedAt: p.purchased_at,
    paymentMethod: p.payment_method,
    total: money(p.total),
    note: p.note,
    items: itemRows.map((r: any) => ({
      ingredientId: r.ingredient_id,
      productId: r.product_id,
      name: r.name,
      quantity: money(r.quantity),
      unitCost: money(r.unit_cost),
      lineTotal: money(r.line_total),
    })),
  };
}

export async function listRecentPurchases(limit = 30): Promise<Purchase[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string }>(
    "select id from gestion_purchases order by created_at desc limit $1",
    [limit]
  );
  const purchases = await Promise.all(rows.map((r) => getPurchase(r.id)));
  return purchases.filter((p): p is Purchase => p !== null);
}
