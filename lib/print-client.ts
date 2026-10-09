interface DirectPrintResponse {
  ok: boolean;
  reason?: "not_configured" | "unsupported_platform" | "print_failed" | "unauthorized" | "bad_request";
  detail?: string;
}

// Intenta imprimir directo en la impresora térmica vía el agente local
// ESC/POS (ver /api/admin/print-direct): sin diálogo de impresión. Solo
// funciona cuando la página se abre desde la instancia local de Windows
// (localhost) con la impresión directa activada en Impresión; contra el
// deploy de Vercel el endpoint contesta unsupported_platform.
// Devuelve el motivo del fallo en vez de tragárselo, para poder decidir qué
// hacer: ver printOrderDocument.
async function printDirect(type: "comanda" | "ticket", orderId: string): Promise<DirectPrintResponse> {
  try {
    const res = await fetch("/api/admin/print-direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, orderId }),
    });
    const data = (await res.json().catch(() => null)) as DirectPrintResponse | null;
    if (data && typeof data.ok === "boolean") return data;
    return { ok: false, reason: res.status === 401 ? "unauthorized" : "bad_request" };
  } catch {
    return { ok: false, reason: "bad_request" };
  }
}

// Imprime la comanda o el ticket de un pedido:
// 1. Impresión directa ESC/POS (sin diálogo).
// 2. Si no está disponible (no configurada, o la página no corre en el
//    servidor local de Windows), cae al navegador como siempre.
// 3. Si SÍ estaba configurada y disponible pero Windows/la impresora fallaron
//    (apagada, sin papel, nombre mal escrito), no se abre el diálogo del
//    navegador por sorpresa en medio del servicio: se muestra el motivo y se
//    pregunta si se quiere imprimir con el navegador.
export async function printOrderDocument(type: "comanda" | "ticket", orderId: string) {
  const direct = await printDirect(type, orderId);
  if (direct.ok) return;

  if (direct.reason === "print_failed") {
    const motivo = direct.detail ? `\n\nMotivo: ${direct.detail}` : "";
    const useBrowser = window.confirm(
      `No se pudo imprimir directo en la impresora.${motivo}\n\n¿Querés imprimir con el navegador?`
    );
    if (!useBrowser) return;
  }

  await printUrl(`/api/admin/print/${type}/${orderId}`);
}

// Imprime una URL (que devuelve HTML listo para imprimir) con window.print()
// sobre un iframe oculto, sin pestañas ni pop-ups. El HTML se carga con
// srcdoc y no con document.write: con document.write el navegador dispara
// el evento load dos veces (una sobre el iframe todavía vacío y otra con el
// contenido), lo que abría dos diálogos de impresión seguidos, el primero
// en blanco.
export async function printUrl(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo generar la impresión");
  const html = await res.text();

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  let printed = false;
  iframe.onload = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(cleanup, 1500);
    }
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
