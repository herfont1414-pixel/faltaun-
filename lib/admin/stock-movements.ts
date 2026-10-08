import type { DbClient } from "@/lib/admin/db";
import { getPool } from "@/lib/admin/db";

export type StockMovementType =
  | "compra"
  | "venta"
  | "receta"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "merma"
  | "devolucion";

// quantity va con signo: negativo si descuenta stock (venta, merma,
// ajuste_negativo), positivo si lo aumenta (compra, ajuste_positivo,
// devolucion) — sumar quantity reconstruye el cambio neto de stock.
export async function recordStockMovement(
  params: {
    productId: number;
    type: StockMovementType;
    quantity: number;
    referenceType?: string;
    referenceId?: string | null;
    note?: string | null;
    userId?: number | null;
  },
  client?: DbClient
) {
  const db = client ?? getPool();
  await db.query(
    `insert into gestion_stock_movements
       (product_id, type, quantity, reference_type, reference_id, note, user_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.productId,
      params.type,
      params.quantity,
      params.referenceType ?? null,
      params.referenceId ?? null,
      params.note ?? null,
      params.userId ?? null,
    ]
  );
}
