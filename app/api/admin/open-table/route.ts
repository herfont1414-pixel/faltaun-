import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { openTable } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { tableNumber } = await request.json();
  return ok(() => openTable(tableNumber));
}
