import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { getPrintableTicket } from "@/lib/admin/print";
import { getPrintConfig } from "@/lib/admin/print-config";
import { getBusinessConfig } from "@/lib/admin/business-config";
import { renderTicketHtml } from "@/lib/admin/print-templates";

export async function GET(_request: Request, { params }: { params: { orderId: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const [ticket, config, business] = await Promise.all([
    getPrintableTicket(params.orderId),
    getPrintConfig(),
    getBusinessConfig(),
  ]);
  const html = renderTicketHtml({ ...ticket, logoUrl: business.logoUrl || null }, config);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
