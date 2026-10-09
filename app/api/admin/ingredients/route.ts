import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { listIngredients } from "@/lib/admin/ingredients";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ingredients: [] });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const ingredients = await listIngredients();
  return NextResponse.json({ ingredients });
}
