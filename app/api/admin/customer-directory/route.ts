import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { listCustomerDirectory } from "@/lib/admin/crm";

export const dynamic = "force-dynamic";

// Lista de clientes para el buscador de Mesa / Mostrador / Delivery (se filtra en la
// pantalla mientras se escribe: una sola consulta por formulario abierto).
export async function GET(request: NextRequest) {
  if (!isDbConfigured()) return NextResponse.json({ customers: [] });
  if (!(await requireUser(request))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ customers: await listCustomerDirectory() });
}
