import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser, recordAudit, ROLES } from "@/lib/admin/auth";
import type { Role } from "@/lib/admin/auth";
import { updateUser } from "@/lib/admin/users";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const actor = await requireUser(request, ["admin"]);
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await request.json();
  const role = body.role as Role | undefined;
  if (role !== undefined && !ROLES.includes(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }
  try {
    const user = await updateUser(Number(params.id), {
      name: typeof body.name === "string" ? body.name : undefined,
      role,
      active: typeof body.active === "boolean" ? body.active : undefined,
      pin: typeof body.pin === "string" && body.pin ? body.pin : undefined,
    });
    await recordAudit({
      userId: actor.id,
      action: "update_user",
      entity: "gestion_users",
      entityId: user.id,
      newValue: { name: user.name, role: user.role, active: user.active },
    });
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
