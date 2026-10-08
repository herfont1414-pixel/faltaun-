import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { addItem } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { orderId, name, price } = await request.json();
  return ok(request, () => addItem(orderId, { name, price }));
}
