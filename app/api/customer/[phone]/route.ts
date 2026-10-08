import { NextRequest, NextResponse } from "next/server";
import { findDeliveryCustomer } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";

export async function GET(_request: NextRequest, { params }: { params: { phone: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ customer: null });
  }
  const phone = decodeURIComponent(params.phone).trim();
  if (phone.length < 6) {
    return NextResponse.json({ customer: null });
  }
  const customer = await findDeliveryCustomer(phone);
  return NextResponse.json({ customer });
}
