import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { recordAudit, requireUser } from "@/lib/admin/auth";
import { getMenuSpecial, setMenuSpecial } from "@/lib/admin/menu-special";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  await ensureSeeded();
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({ special: await getMenuSpecial() });
}

export async function PUT(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  await ensureSeeded();
  const actor = await requireUser(request, ["admin", "encargado"]);
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { active?: boolean; productId?: number | null; text?: string };
  try {
    const before = await getMenuSpecial();
    const special = await setMenuSpecial({
      active: body.active === true,
      productId: typeof body.productId === "number" ? body.productId : null,
      text: typeof body.text === "string" ? body.text : "",
    });
    await recordAudit({
      userId: actor.id,
      action: "config_change",
      entity: "menu_special",
      oldValue: before,
      newValue: special,
    });
    return NextResponse.json({ special });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 400 });
  }
}
