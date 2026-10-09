import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { listSuppliers } from "@/lib/admin/suppliers";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ suppliers: [] });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const suppliers = await listSuppliers();
  return NextResponse.json({ suppliers });
}
