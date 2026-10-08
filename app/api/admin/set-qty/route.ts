import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { setQty } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { orderId, itemId, delta } = await request.json();
  return ok(request, () => setQty(orderId, itemId, delta));
}
