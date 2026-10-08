import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ user: null });
  }
  const user = await requireUser(request);
  return NextResponse.json({ user });
}
