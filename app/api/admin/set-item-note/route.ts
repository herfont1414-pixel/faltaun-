import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { setItemNote } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { orderId, itemId, note } = await request.json();
  return ok(() => setItemNote(orderId, itemId, note));
}
