import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { setOrderNotes } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { orderId, notes } = await request.json();
  return ok(() => setOrderNotes(orderId, notes));
}
