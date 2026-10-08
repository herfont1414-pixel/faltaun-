import { NextRequest, NextResponse } from "next/server";
import { getLoyalty, LOYALTY_THRESHOLD } from "@/lib/admin/loyalty";
import { isDbConfigured } from "@/lib/admin/db";

export async function GET(_request: NextRequest, { params }: { params: { phone: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ account: null, threshold: LOYALTY_THRESHOLD });
  }
  const phone = decodeURIComponent(params.phone).trim();
  if (phone.length < 6) {
    return NextResponse.json({ account: null, threshold: LOYALTY_THRESHOLD });
  }
  const account = await getLoyalty(phone);
  return NextResponse.json({ account, threshold: LOYALTY_THRESHOLD });
}
