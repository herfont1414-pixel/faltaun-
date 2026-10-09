import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { addItem } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { orderId, productId } = await request.json();
  return ok(request, () => addItem(orderId, Number(productId)));
}
