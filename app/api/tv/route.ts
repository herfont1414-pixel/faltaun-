import { NextResponse } from "next/server";
import { getTvData } from "@/lib/tv";

export const dynamic = "force-dynamic";

// Datos de la pantalla "Madero TV" (/tv): solo información pública del menú.
export async function GET() {
  try {
    return NextResponse.json(await getTvData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
