import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { requireUser, recordAudit, ROLES } from "@/lib/admin/auth";
import type { Role } from "@/lib/admin/auth";
import { createUser, listUsers } from "@/lib/admin/users";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ users: [] });
  }
  await ensureSeeded();
  if (!(await requireUser(request, ["admin"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  await ensureSeeded();
  const actor = await requireUser(request, ["admin"]);
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await request.json();
  const name = String(body.name ?? "");
  const pin = String(body.pin ?? "");
  const role = body.role as Role;
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }
  try {
    const user = await createUser({ name, pin, role });
    await recordAudit({
      userId: actor.id,
      action: "create_user",
      entity: "gestion_users",
      entityId: user.id,
      newValue: { name: user.name, role: user.role },
    });
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
