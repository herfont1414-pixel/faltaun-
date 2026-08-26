import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { sendToKitchen } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { orderId } = await request.json();
  return ok(() => sendToKitchen(orderId));
}
