import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { recordAudit, requireUser } from "@/lib/admin/auth";
import { clearMenuSpecialImage, getMenuSpecialImageInfo, setMenuSpecialImage } from "@/lib/admin/menu-special";

export const dynamic = "force-dynamic";

// Foto del especial del día (admin y encargado). PUT la reemplaza, DELETE la quita.
export async function PUT(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  await ensureSeeded();
  const actor = await requireUser(request, ["admin", "encargado"]);
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { image?: unknown; productId?: unknown };
  try {
    const info = await setMenuSpecialImage(
      typeof body.image === "string" ? body.image : "",
      typeof body.productId === "number" ? body.productId : null
    );
    // En la auditoría va el tamaño, no la imagen.
    await recordAudit({ userId: actor.id, action: "config_change", entity: "menu_special_image", newValue: info });
    return NextResponse.json({ image: info });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar la foto" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  const actor = await requireUser(request, ["admin", "encargado"]);
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const before = await getMenuSpecialImageInfo();
  await clearMenuSpecialImage();
  await recordAudit({ userId: actor.id, action: "config_change", entity: "menu_special_image", oldValue: before, newValue: null });
  return NextResponse.json({ image: null });
}
