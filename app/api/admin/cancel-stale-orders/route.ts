import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { cancelStaleOpenOrders } from "@/lib/admin/store";

// Anula todos los pedidos que quedaron abiertos de jornadas anteriores (antes de las 6:00 de hoy).
export async function POST(request: NextRequest) {
  return ok(request, (actor) => cancelStaleOpenOrders(actor.id), ["admin", "encargado"]);
}
