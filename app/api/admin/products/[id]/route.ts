import { NextRequest, NextResponse } from "next/server";
import { updateProduct } from "@/lib/admin/store";
import { isDbConfigured, getPool } from "@/lib/admin/db";
import { requireUser, recordAudit } from "@/lib/admin/auth";
import { recordStockMovement } from "@/lib/admin/stock-movements";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const actor = await requireUser(request, ["admin", "encargado"]);
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await request.json();
  const id = Number(params.id);

  const pool = getPool();
  const { rows: before } = await pool.query<{
    price: string;
    active: boolean;
    in_stock: boolean;
    stock_qty: number | null;
  }>("select price, active, in_stock, stock_qty from gestion_products where id = $1", [id]);

  const changes = {
    price: typeof body.price === "number" ? body.price : undefined,
    active: typeof body.active === "boolean" ? body.active : undefined,
    showOnline: typeof body.showOnline === "boolean" ? body.showOnline : undefined,
    inStock: typeof body.inStock === "boolean" ? body.inStock : undefined,
    stockQty: "stockQty" in body ? (body.stockQty === null ? null : Number(body.stockQty)) : undefined,
    printAreaId:
      "printAreaId" in body ? (body.printAreaId === null ? null : Number(body.printAreaId)) : undefined,
  };
  await updateProduct(id, changes);

  if (changes.price !== undefined || changes.stockQty !== undefined) {
    await recordAudit({
      userId: actor.id,
      action: changes.price !== undefined ? "price_change" : "stock_adjust",
      entity: "gestion_products",
      entityId: id,
      oldValue: before[0] ?? null,
      newValue: changes,
    });
  }

  // Un ajuste manual de stock (editar el número a mano en Productos) deja
  // registro en la bitácora igual que una venta, para poder reconstruir
  // después por qué cambió el stock de un producto.
  if (changes.stockQty !== undefined && changes.stockQty !== null && before[0]?.stock_qty != null) {
    const delta = changes.stockQty - before[0].stock_qty;
    if (delta !== 0) {
      await recordStockMovement({
        productId: id,
        type: delta > 0 ? "ajuste_positivo" : "ajuste_negativo",
        quantity: delta,
        referenceType: "manual",
        userId: actor.id,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
