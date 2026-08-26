import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { requestBill } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { tableNumber } = await request.json();
  return ok(() => requestBill(tableNumber));
}
