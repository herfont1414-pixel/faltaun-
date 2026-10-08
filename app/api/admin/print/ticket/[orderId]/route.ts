import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { getPrintableTicket } from "@/lib/admin/print";
import { getPrintConfig } from "@/lib/admin/print-config";
import { renderTicketHtml } from "@/lib/admin/print-templates";

export async function GET(_request: Request, { params }: { params: { orderId: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  const [ticket, config] = await Promise.all([getPrintableTicket(params.orderId), getPrintConfig()]);
  const html = renderTicketHtml(ticket, config);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
