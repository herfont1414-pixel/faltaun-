import { NextRequest } from "next/server";
import { ok } from "@/lib/admin/api-helpers";
import { createDeliveryOrder } from "@/lib/admin/store";

export async function POST(request: NextRequest) {
  const { name, phone, address, zone, shippingCost } = (await request.json()) as {
    name: string;
    phone: string;
    address: string;
    zone: string | null;
    shippingCost: number;
  };
  return ok(() =>
    createDeliveryOrder({
      name,
      phone,
      address,
      zone: zone ?? null,
      shippingCost: shippingCost ?? 0,
    })
  );
}
