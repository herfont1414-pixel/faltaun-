import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { getLoyaltyReport } from "@/lib/admin/loyalty-report";

export const dynamic = "force-dynamic";

// Informe de fidelización: SOLO LECTURA. Esta ruta solo exporta GET (no hay forma de
// enviarle datos para guardar), no llama a ensureSeeded y no registra auditoría.
export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "La base de datos todavía no está configurada." }, { status: 503 });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const report = await getLoyaltyReport();
    return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo generar el informe" },
      { status: 500 }
    );
  }
}
