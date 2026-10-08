import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { getPrintableOrder } from "@/lib/admin/print";
import { getPrintConfig } from "@/lib/admin/print-config";
import { renderComandaHtml, toComandaPrintData } from "@/lib/admin/print-templates";

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const [order, config] = await Promise.all([getPrintableOrder(params.orderId), getPrintConfig()]);
  const html = renderComandaHtml(toComandaPrintData(order), config);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
