import { NextResponse } from "next/server";
import { getDbMode } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

// Lo consulta el lanzador de la PC (scripts\iniciar-local.bat) antes de abrir el panel: si ya hay un
// servidor andando pero con otra base (por ejemplo, uno viejo que arrancó con la de la nube), lo
// reinicia con la base local. Solo dice si es la base local; no expone ningún dato.
export function GET() {
  return NextResponse.json({ local: getDbMode() === "sqlite" });
}
