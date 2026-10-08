import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { getPrintableOrder } from "@/lib/admin/print";
import { getPrintConfig } from "@/lib/admin/print-config";
import { renderComandaHtml } from "@/lib/admin/print-templates";

export async function GET(_request: Request, { params }: { params: { orderId: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const [order, config] = await Promise.all([getPrintableOrder(params.orderId), getPrintConfig()]);

  const areas = order.areas.map((name) => ({
    name,
    items: order.items.filter((it) => it.area === name).map((it) => ({ name: it.name, qty: it.qty })),
  }));

  const html = renderComandaHtml(
    {
      orderId: order.orderId,
      tableNumber: order.tableNumber,
      origin: order.origin,
      customerName: order.customerName,
      openedAt: order.openedAt,
      notes: order.notes,
      areas,
    },
    config
  );

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
