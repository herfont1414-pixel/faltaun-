import { NextRequest, NextResponse } from "next/server";
import { updateProduct } from "@/lib/admin/store";
import { isDbConfigured, getPool } from "@/lib/admin/db";
import { requireUser, recordAudit } from "@/lib/admin/auth";

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
  const { rows: before } = await pool.query(
    "select price, active, in_stock, stock_qty from gestion_products where id = $1",
    [id]
  );

  const changes = {
    price: typeof body.price === "number" ? body.price : undefined,
    active: typeof body.active === "boolean" ? body.active : undefined,
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

  return NextResponse.json({ ok: true });
}
