import { NextResponse } from "next/server";
import { getState } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ notConfigured: true });
  }
  const state = await getState();
  return NextResponse.json(state);
}
