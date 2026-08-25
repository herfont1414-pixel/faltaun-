import { NextRequest } from "next/server";
import { ok } from "@/lib/gestion/api-helpers";
import { closeOrder } from "@/lib/gestion/store";

export async function POST(request: NextRequest) {
  const { orderId } = await request.json();
  return ok(() => closeOrder(orderId));
}
