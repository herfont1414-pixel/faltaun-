import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { openTable } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { tableNumber, partySize, customerName, waiter, notes } = await request.json();
  return ok(request, () => openTable(tableNumber, { partySize, customerName, waiter, notes }));
}
