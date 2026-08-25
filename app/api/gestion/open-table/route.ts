import { NextRequest } from "next/server";
import { ok } from "@/lib/gestion/api-helpers";
import { openTable } from "@/lib/gestion/store";

export async function POST(request: NextRequest) {
  const { tableNumber } = await request.json();
  return ok(() => openTable(tableNumber));
}
