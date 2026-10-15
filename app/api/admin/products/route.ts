import { NextRequest, NextResponse } from "next/server";
import { createProduct, listAllProducts } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { ensureSeeded } from "@/lib/admin/seed";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ products: [] });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const products = await listAllProducts();
  return NextResponse.json({ products });
}

// Nuevo producto desde el panel. Solo admin y encargado; queda en la auditoría.
export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  const actor = await requireUser(request, ["admin", "encargado"]);
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const product = await createProduct(
      {
        name: body.name,
        category: String(body.category ?? ""),
        price: Number(body.price),
        stockQty: body.stockQty === "" || body.stockQty === undefined ? null : body.stockQty,
        showOnline: body.showOnline !== false,
        printAreaId: body.printAreaId ?? null,
      },
      actor.id
    );
    const products = await listAllProducts();
    return NextResponse.json({ product, products });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
