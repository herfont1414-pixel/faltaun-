import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import { getPrintableOrder, getPrintableTicket, markComandaPrinted } from "@/lib/admin/print";
import { getPrintConfig } from "@/lib/admin/print-config";
import { getBusinessConfig } from "@/lib/admin/business-config";
import { toComandaPrintData } from "@/lib/admin/print-templates";
import type { TicketPrintData } from "@/lib/admin/print-templates";
import { renderComandaEscPos, renderTicketEscPos } from "@/lib/admin/escpos";
import { sendRawToPrinter } from "@/lib/admin/print-direct";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { type?: string; orderId?: string; all?: boolean } | null;
  const type = body?.type;
  const orderId = body?.orderId;
  if ((type !== "comanda" && type !== "ticket") || !orderId) {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const config = await getPrintConfig();

  let buffer: Buffer;
  let printedItems: { id: string; qty: number }[] = [];
  try {
    if (type === "comanda") {
      const all = body?.all === true;
      const order = await getPrintableOrder(orderId, { all });
      if (order.items.length === 0 && !all) {
        // Nada nuevo desde la última comanda: no se gasta papel.
        return NextResponse.json({ ok: false, reason: "nothing_new" });
      }
      printedItems = all ? [] : order.items.map((it) => ({ id: it.id, qty: it.qty }));
      buffer = renderComandaEscPos(toComandaPrintData(order), config);
    } else {
      const [ticket, business] = await Promise.all([getPrintableTicket(orderId), getBusinessConfig()]);
      const data: TicketPrintData = { ...ticket, logoUrl: business.logoUrl || null };
      buffer = renderTicketEscPos(data, config);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ ok: false, reason: "print_failed", detail: message }, { status: 400 });
  }

  const result = await sendRawToPrinter(buffer);
  // Solo si salió por la impresora: si no está disponible, el navegador lo imprime y lo marca él.
  if (result.ok && printedItems.length > 0) await markComandaPrinted(orderId, printedItems);
  return NextResponse.json(result);
}
