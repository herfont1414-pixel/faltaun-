import { NextRequest } from "next/server";
import { ok } from "@/lib/gestion/api-helpers";
import { requestBill } from "@/lib/gestion/store";

export async function POST(request: NextRequest) {
  const { tableNumber } = await request.json();
  return ok(() => requestBill(tableNumber));
}
