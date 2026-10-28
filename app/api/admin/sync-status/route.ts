import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/admin/auth";
import { getBackupStatus } from "@/lib/admin/backup";
import { getSyncStatus } from "@/lib/admin/sync-worker";

export const dynamic = "force-dynamic";

// Estado de la conexión con la nube y de las copias de seguridad (se muestra en el menú lateral).
export async function GET(request: NextRequest) {
  if (!(await requireUser(request))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ sync: getSyncStatus(), backup: getBackupStatus() });
}
