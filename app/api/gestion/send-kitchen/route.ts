import { NextRequest } from "next/server";
import { ok } from "@/lib/gestion/api-helpers";
import { sendToKitchen } from "@/lib/gestion/store";

export async function POST(request: NextRequest) {
  const { orderId } = await request.json();
  return ok(() => sendToKitchen(orderId));
}
