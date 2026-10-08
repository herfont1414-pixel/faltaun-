import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser, recordAudit } from "@/lib/admin/auth";
import { createPurchase, listRecentPurchases } from "@/lib/admin/purchases";
import type { PurchaseItemInput } from "@/lib/admin/purchases";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ purchases: [] });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const purchases = await listRecentPurchases(30);
  return NextResponse.json({ purchases });
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const actor = await requireUser(request, ["admin", "encargado"]);
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await request.json();
  const items: PurchaseItemInput[] = Array.isArray(body.items)
    ? body.items.map((it: any) => ({
        ingredientId: it.ingredientId ? Number(it.ingredientId) : null,
        productId: it.productId ? Number(it.productId) : null,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
      }))
    : [];

  try {
    const purchase = await createPurchase({
      supplierId: body.supplierId ? Number(body.supplierId) : null,
      paymentMethod: body.paymentMethod === "transferencia" || body.paymentMethod === "cuenta_corriente" ? body.paymentMethod : "efectivo",
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
      userId: actor.id,
      items,
    });
    await recordAudit({
      userId: actor.id,
      action: "purchase",
      entity: "gestion_purchases",
      entityId: purchase.id,
      newValue: { total: purchase.total, items: purchase.items.length },
    });
    return NextResponse.json({ purchase });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
