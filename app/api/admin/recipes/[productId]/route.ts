import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser, recordAudit } from "@/lib/admin/auth";
import { getRecipe, upsertRecipe } from "@/lib/admin/recipes";

export async function GET(request: NextRequest, { params }: { params: { productId: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ recipe: null });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const recipe = await getRecipe(Number(params.productId));
  if (!recipe) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ recipe });
}

export async function PUT(request: NextRequest, { params }: { params: { productId: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const actor = await requireUser(request, ["admin", "encargado"]);
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const productId = Number(params.productId);
  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items : [];

  try {
    await upsertRecipe(
      productId,
      items.map((it: any) => ({ ingredientId: Number(it.ingredientId), quantity: Number(it.quantity) }))
    );
    await recordAudit({
      userId: actor.id,
      action: "recipe_change",
      entity: "gestion_recipes",
      entityId: productId,
      newValue: { items },
    });
    const recipe = await getRecipe(productId);
    return NextResponse.json({ recipe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
