import { NextRequest } from "next/server";
import { ok } from "@/lib/gestion/api-helpers";
import { addItem } from "@/lib/gestion/store";

export async function POST(request: NextRequest) {
  const { orderId, name, price } = await request.json();
  return ok(() => addItem(orderId, { name, price }));
}
