import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { updateTableDetails } from "@/lib/admin/store";

// Editar los datos de una mesa abierta (personas, cliente, mozo).
export async function POST(request: NextRequest) {
  const { orderId, partySize, customerName, waiter } = await request.json();
  return ok(request, () =>
    updateTableDetails(String(orderId ?? ""), {
      partySize: partySize === null || partySize === undefined || partySize === "" ? null : Number(partySize),
      customerName: typeof customerName === "string" ? customerName : null,
      waiter: typeof waiter === "string" ? waiter : null,
    })
  );
}
