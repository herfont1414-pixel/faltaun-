import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { requireUser } from "@/lib/admin/auth";
import { updateReward } from "@/lib/admin/loyalty";

export const dynamic = "force-dynamic";

// Edita nombre, descripción, producto vinculado y estado de un premio. Los hitos
// (cuántos sellos) no se pueden cambiar desde acá.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "La base de datos todavía no está configurada." }, { status: 503 });
  }
  await ensureSeeded();
  const user = await requireUser(request, ["admin", "encargado"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const id = Number(params.id);
  const body = await request.json().catch(() => null);
  if (!Number.isInteger(id) || id <= 0 || !body) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const changes: Parameters<typeof updateReward>[1] = {};
  if (typeof body.name === "string") changes.name = body.name;
  if ("description" in body) changes.description = body.description === null ? null : String(body.description);
  if ("productId" in body) {
    const pid = body.productId === null || body.productId === "" ? null : Number(body.productId);
    if (pid !== null && (!Number.isInteger(pid) || pid <= 0)) {
      return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
    }
    changes.productId = pid;
  }
  if (typeof body.active === "boolean") changes.active = body.active;
  try {
    return NextResponse.json({ ok: true, reward: await updateReward(id, changes, user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar" }, { status: 400 });
  }
}
