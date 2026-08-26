import { NextResponse } from "next/server";
import { listAllProducts } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ products: [] });
  }
  const products = await listAllProducts();
  return NextResponse.json({ products });
}
