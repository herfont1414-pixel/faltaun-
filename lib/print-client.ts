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
