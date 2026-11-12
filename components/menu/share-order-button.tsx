"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Receipt, Share2, X } from "lucide-react";
import { canShareImage, renderPhotoCard, renderTicketCard, shareImage } from "@/lib/share-card";
import type { ShareCardItem } from "@/lib/share-card";
import { MENU_URL, orderReference } from "@/lib/order-messages";
import { INSTAGRAM_HANDLE } from "@/lib/brand";

type Style = "foto" | "ticket";

// "¿Te gustó? Compartilo en tus historias" en un pedido ya entregado (o listo para retirar).
// El cliente elige: su foto con el marco de Madero, o la comanda en papel. Ve cómo quedó y
// recién ahí comparte (el menú de compartir del celular se abre con ese toque).
export function ShareOrderButton({ orderId, items, createdAt }: { orderId: string; items: ShareCardItem[]; createdAt: string }) {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ style: Style; blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  async function make(style: Style, photo?: Blob) {
    setBusy(true);
    setError("");
    try {
      const blob =
        style === "foto" && photo
          ? await renderPhotoCard({ photo, seed: orderId, menuUrl: MENU_URL })
          : await renderTicketCard({ items, seed: orderId, reference: orderReference(orderId), date: new Date(createdAt), menuUrl: MENU_URL });
      setResult({ style, blob, url: URL.createObjectURL(blob) });
      setChoosing(false);
    } catch {
      setError(style === "foto" ? "No pudimos usar esa foto. Probá con otra." : "No se pudo armar la imagen. Probá de nuevo.");
    }
    setBusy(false);
  }

  async function share() {
    if (!result) return;
    const r = await shareImage(result.blob);
    if (r === "failed") setError("No se pudo abrir el menú de compartir. Descargá la imagen y subila a tus historias.");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(""); setChoosing(true); }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-ember-deep via-ember to-ember-soft px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(217,123,63,0.9)] transition active:scale-[0.99]"
      >
        <Camera className="h-4 w-4" />
        ¿Te gustó? Compartilo en tus historias
      </button>
      <p className="mt-1 text-center text-[11px] text-stone-500">Etiquetanos @{INSTAGRAM_HANDLE} 📸</p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) make("foto", file);
        }}
      />

      {(choosing || result) && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-4 sm:items-center" onClick={() => { setChoosing(false); setResult(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-base-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-display text-lg text-stone-50">{result ? "¡Quedó así!" : "Compartí tu pedido"}</h4>
              <button type="button" onClick={() => { setChoosing(false); setResult(null); }} className="rounded-full bg-white/10 p-1.5" aria-label="Cerrar">
                <X className="h-4 w-4 text-stone-200" />
              </button>
            </div>

            {!result ? (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-xl border border-ember/40 bg-ember/10 p-4 text-left transition hover:border-ember disabled:opacity-60"
                >
                  <Camera className="h-7 w-7 shrink-0 text-ember-soft" />
                  <span>
                    <span className="block text-sm font-semibold text-stone-50">Con mi foto</span>
                    <span className="block text-xs text-stone-400">Sacale una foto a tu comida (o elegí una) y le ponemos el marco de Madero.</span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => make("ticket")}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/30 disabled:opacity-60"
                >
                  <Receipt className="h-7 w-7 shrink-0 text-stone-300" />
                  <span>
                    <span className="block text-sm font-semibold text-stone-50">Ticket Madero</span>
                    <span className="block text-xs text-stone-400">Tu comanda en papel con lo que pediste y tu calificación.</span>
                  </span>
                </button>
                {busy && <p className="text-center text-xs text-stone-400">Armando tu imagen…</p>}
              </div>
            ) : (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.url} alt="Tu pedido en Madero" className="mx-auto max-h-[55vh] rounded-xl" />
                <div className="mt-4 space-y-2">
                  {canShareImage(result.blob) && (
                    <button type="button" onClick={share} className="flex w-full items-center justify-center gap-2 rounded-full bg-ember px-4 py-2.5 text-sm font-semibold text-base">
                      <Share2 className="h-4 w-4" /> Compartir
                    </button>
                  )}
                  <a
                    href={result.url}
                    download={result.blob.type === "image/png" ? "mi-pedido-madero.png" : "mi-pedido-madero.jpg"}
                    className="block w-full rounded-full border border-white/15 px-4 py-2.5 text-center text-sm font-medium text-stone-200"
                  >
                    Descargar imagen
                  </a>
                  <button type="button" onClick={() => setResult(null)} className="w-full py-1 text-xs text-stone-400 underline">
                    {result.style === "foto" ? "Probar con otra foto o el ticket" : "Probar con mi foto"}
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-stone-500">Subila a tus historias y etiquetanos @{INSTAGRAM_HANDLE}.</p>
              </div>
            )}
            {error && <p className="mt-2 text-center text-xs text-ember-soft">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
