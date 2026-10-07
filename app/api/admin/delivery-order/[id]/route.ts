import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { setDeliveryPerson, setDeliveryStatus } from "@/lib/admin/store";
import type { DeliveryStatus } from "@/lib/admin/types";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { status, deliveryPerson } = (await request.json()) as {
    status?: DeliveryStatus;
    deliveryPerson?: string | null;
  };
  return ok(async () => {
    if (status) await setDeliveryStatus(params.id, status);
    if (deliveryPerson !== undefined) await setDeliveryPerson(params.id, deliveryPerson);
    return { id: params.id };
  });
}
