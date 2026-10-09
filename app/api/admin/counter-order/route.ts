import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { createCounterOrder } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  return ok(request, () => createCounterOrder());
}
