import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/admin/auth";
import { lanInfo } from "@/lib/admin/lan";

export const dynamic = "force-dynamic";

// Dirección de la PC en la red del local, para abrir el panel desde los celulares.
export async function GET(request: NextRequest) {
  if (!(await requireUser(request))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(await lanInfo());
}
