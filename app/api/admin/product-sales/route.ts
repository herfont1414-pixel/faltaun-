import { NextRequest, NextResponse } from "next/server";
import { getProductSales } from "@/lib/admin/product-sales";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

// Productos vendidos por rango de días (AAAA-MM-DD): historial de Fudo + MaderoSys.
export async function GET(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ report: null });
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  try {
    return NextResponse.json({ report: await getProductSales(from, to) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
