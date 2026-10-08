// Intenta imprimir directo en la impresora térmica vía el agente local
// ESC/POS (ver /api/admin/print-direct): sin diálogo de impresión, sin
// iframe, sin nada visible. Solo puede funcionar cuando el navegador le
// habla a la instancia local (start-local.bat) corriendo en la misma PC
// que tiene la impresora — contra el deploy de Vercel, o sin la
// impresión directa configurada en Impresión, el endpoint devuelve
// ok:false y el llamador cae al flujo de siempre (printUrl).
async function printDirect(type: "comanda" | "ticket", orderId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/print-direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, orderId }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok: boolean };
    return !!data.ok;
  } catch {
    return false;
  }
}

// Imprime la comanda o el ticket de un pedido: primero intenta la
// impresión directa (silenciosa, sin ningún diálogo); si no está
// disponible, cae al flujo de siempre (iframe oculto + window.print()).
export async function printOrderDocument(type: "comanda" | "ticket", orderId: string) {
  const directOk = await printDirect(type, orderId);
  if (directOk) return;
  await printUrl(`/api/admin/print/${type}/${orderId}`);
}

// Imprime una URL (que devuelve HTML listo para imprimir) de forma
// silenciosa, sin pestañas ni pop-ups: la carga en un iframe oculto y
// dispara window.print() sobre ese iframe en cuanto termina de cargar.
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

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(cleanup, 1500);
    }
  };

  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    throw new Error("No se pudo preparar la impresión");
  }
  doc.open();
  doc.write(html);
  doc.close();
}
