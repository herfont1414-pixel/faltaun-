import { NextRequest, NextResponse } from "next/server";
import { findDeliveryCustomer } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export async function GET(request: NextRequest, { params }: { params: { phone: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const customer = await findDeliveryCustomer(decodeURIComponent(params.phone));
  return NextResponse.json({ customer });
}
