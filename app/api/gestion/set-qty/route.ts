import { NextRequest } from "next/server";
import { ok } from "@/lib/gestion/api-helpers";
import { setQty } from "@/lib/gestion/store";

export async function POST(request: NextRequest) {
  const { orderId, itemId, delta } = await request.json();
  return ok(() => setQty(orderId, itemId, delta));
}
