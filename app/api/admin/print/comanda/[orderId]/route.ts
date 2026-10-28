import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { getPrintableOrder, markComandaPrinted } from "@/lib/admin/print";
import { getPrintConfig } from "@/lib/admin/print-config";
import { renderComandaHtml, toComandaPrintData } from "@/lib/admin/print-templates";

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  // Por defecto solo lo que todavía no salió en una comanda; ?all=1 reimprime todo lo enviado.
  const all = request.nextUrl.searchParams.get("all") === "1";
  const [order, config] = await Promise.all([getPrintableOrder(params.orderId, { all }), getPrintConfig()]);
  // Nada nuevo para imprimir: sin contenido (el panel avisa, no abre el diálogo de impresión).
  if (order.items.length === 0 && !all) return new NextResponse(null, { status: 204 });
  const html = renderComandaHtml(toComandaPrintData(order), config);
  // Desde el navegador no se puede saber si se llegó a imprimir: se da por impreso al generarla
  // (si falla, "Reimprimir comanda completa" la saca de nuevo).
  if (!all) await markComandaPrinted(params.orderId, order.items.map((it) => ({ id: it.id, qty: it.qty })));
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
