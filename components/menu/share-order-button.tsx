"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";
import { shareOrderCard } from "@/lib/share-card";
import type { ShareCardItem } from "@/lib/share-card";
import { MENU_URL } from "@/lib/order-messages";
import { INSTAGRAM_HANDLE } from "@/lib/brand";

// Botón "Compartir en mis historias" de un pedido ya entregado (o listo para retirar).
export function ShareOrderButton({ orderId, items }: { orderId: string; items: ShareCardItem[] }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function share() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await shareOrderCard({ items, seed: orderId, menuUrl: MENU_URL });
      if (result.kind === "preview") setPreview(result.url);
    } catch {
      setError("No se pudo armar la imagen. Probá de nuevo.");
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-ember-deep via-ember to-ember-soft px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(217,123,63,0.9)] transition active:scale-[0.99] disabled:opacity-60"
      >
        <Camera className="h-4 w-4" />
        {busy ? "Armando tu imagen…" : "¿Te gustó? Compartilo en tus historias"}
      </button>
      <p className="mt-1 text-center text-[11px] text-stone-500">Etiquetanos @{INSTAGRAM_HANDLE} 📸</p>
      {error && <p className="mt-1 text-center text-xs text-ember-soft">{error}</p>}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          <div className="w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setPreview(null)} className="rounded-full bg-white/10 p-1.5" aria-label="Cerrar">
                <X className="h-4 w-4 text-stone-200" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Tu pedido en Madero" className="w-full rounded-xl" />
            <a
              href={preview}
              download="mi-pedido-madero.png"
              className="mt-3 block w-full rounded-full bg-ember px-4 py-2.5 text-center text-sm font-semibold text-base"
            >
              Descargar imagen
            </a>
            <p className="mt-2 text-center text-xs text-stone-400">
              Subila a tus historias y etiquetanos @{INSTAGRAM_HANDLE}. En el celular también podés mantenerla apretada para guardarla.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
