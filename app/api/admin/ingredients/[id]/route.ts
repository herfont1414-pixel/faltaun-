import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser, recordAudit } from "@/lib/admin/auth";
import { updateIngredientCost } from "@/lib/admin/ingredients";

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
  try {
    const ingredient = await updateIngredientCost(id, Number(body.cost));
    await recordAudit({
      userId: actor.id,
      action: "ingredient_cost_change",
      entity: "gestion_ingredients",
      entityId: id,
      newValue: { cost: ingredient.cost },
    });
    return NextResponse.json({ ingredient });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
