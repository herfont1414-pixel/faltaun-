import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { requireUser } from "@/lib/admin/auth";
import { importStamps } from "@/lib/admin/loyalty-import";

export const dynamic = "force-dynamic";

// Carga de sellos que los clientes ya tenían (solo admin). { text, confirm }:
// sin confirm devuelve la vista previa y no guarda nada.
export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "La base de datos todavía no está configurada." }, { status: 503 });
  }
  await ensureSeeded();
  const user = await requireUser(request, ["admin"]);
  if (!user) return NextResponse.json({ error: "Solo un administrador puede cargar sellos." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  if (text.length > 100_000) return NextResponse.json({ error: "La lista es demasiado larga." }, { status: 400 });
  try {
    const { results, errors } = await importStamps(text, user.id, { dryRun: body?.confirm !== true });
    if (errors.length) return NextResponse.json({ error: errors.join("\n"), errors }, { status: 400 });
    return NextResponse.json({ saved: body?.confirm === true, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
