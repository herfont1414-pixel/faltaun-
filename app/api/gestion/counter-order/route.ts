import { ok } from "@/lib/gestion/api-helpers";
import { createCounterOrder } from "@/lib/gestion/store";

export async function POST() {
  return ok(() => createCounterOrder());
}
