import { NextRequest, NextResponse } from "next/server";
import { updateProduct } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const body = await request.json();
  await updateProduct(Number(params.id), {
    price: typeof body.price === "number" ? body.price : undefined,
    active: typeof body.active === "boolean" ? body.active : undefined,
  });
  return NextResponse.json({ ok: true });
}
