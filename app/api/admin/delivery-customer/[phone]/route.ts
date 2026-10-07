import { NextRequest, NextResponse } from "next/server";
import { findDeliveryCustomer } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";

export async function GET(_request: NextRequest, { params }: { params: { phone: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const customer = await findDeliveryCustomer(decodeURIComponent(params.phone));
  return NextResponse.json({ customer });
}
