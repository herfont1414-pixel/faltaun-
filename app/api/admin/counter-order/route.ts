import { ok } from "@/lib/admin/api-helpers";
import { createCounterOrder } from "@/lib/admin/store";

export async function POST() {
  return ok(() => createCounterOrder());
}
