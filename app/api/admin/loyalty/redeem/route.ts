import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { requireUser } from "@/lib/admin/auth";
import { redeemGrant } from "@/lib/admin/loyalty";

export const dynamic = "force-dynamic";

// Registra la entrega física de un premio (admin y encargado). Toda la validación
// y el control de duplicados se hacen en el servidor (ver redeemGrant).
export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "La base de datos todavía no está configurada." }, { status: 503 });
  }
  await ensureSeeded();
  const user = await requireUser(request, ["admin", "encargado"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.grantId !== "string" || !body.grantId) {
    return NextResponse.json({ error: "Falta indicar el premio" }, { status: 400 });
  }
  const productId =
    body.productId === undefined || body.productId === null || body.productId === "" ? null : Number(body.productId);
  if (productId !== null && (!Number.isInteger(productId) || productId <= 0)) {
    return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
  }
  try {
    const grant = await redeemGrant({
      grantId: body.grantId,
      userId: user.id,
      productId,
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json({ ok: true, grant });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo registrar el canje" }, { status: 400 });
  }
}
