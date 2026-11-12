"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Share2, X } from "lucide-react";
import { canShareImage, renderPhotoCard, shareImage } from "@/lib/share-card";
import { MENU_URL } from "@/lib/order-messages";
import { INSTAGRAM_HANDLE } from "@/lib/brand";

// "¿Te gustó? Compartilo en tus historias" en un pedido ya entregado (o listo para retirar).
// El cliente saca una foto de su comida (o elige una de la galería), le ponemos el marco de
// Madero, ve cómo quedó y recién ahí comparte (el menú de compartir se abre con ese toque).
export function ShareOrderButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  async function make(photo: Blob) {
    setBusy(true);
    setError("");
    try {
      const blob = await renderPhotoCard({ photo, seed: orderId, menuUrl: MENU_URL });
      setResult({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("No pudimos usar esa foto. Probá con otra.");
    }
    setBusy(false);
  }

  async function share() {
    if (!result) return;
    const r = await shareImage(result.blob);
    if (r === "failed") setError("No se pudo abrir el menú de compartir. Descargá la imagen y subila a tus historias.");
  }

  const pick = () => {
    setError("");
    fileRef.current?.click();
  };

  return (
    <>
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-ember-deep via-ember to-ember-soft px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(217,123,63,0.9)] transition active:scale-[0.99] disabled:opacity-60"
      >
        <Camera className="h-4 w-4" />
        {busy ? "Armando tu foto…" : "¿Te gustó? Sacale una foto y compartila"}
      </button>
      <p className="mt-1 text-center text-[11px] text-stone-500">Le ponemos el marco de Madero · etiquetanos @{INSTAGRAM_HANDLE} 📸</p>
      {error && !result && <p className="mt-1 text-center text-xs text-ember-soft">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) make(file);
        }}
      />

      {result && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-4 sm:items-center" onClick={() => setResult(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-base-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-display text-lg text-stone-50">¡Quedó así!</h4>
              <button type="button" onClick={() => setResult(null)} className="rounded-full bg-white/10 p-1.5" aria-label="Cerrar">
                <X className="h-4 w-4 text-stone-200" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.url} alt="Tu pedido en Madero" className="mx-auto max-h-[55vh] rounded-xl" />
            <div className="mt-4 space-y-2">
              {canShareImage(result.blob) && (
                <button type="button" onClick={share} className="flex w-full items-center justify-center gap-2 rounded-full bg-ember px-4 py-2.5 text-sm font-semibold text-base">
                  <Share2 className="h-4 w-4" /> Compartir
                </button>
              )}
              <a href={result.url} download="mi-pedido-madero.jpg" className="block w-full rounded-full border border-white/15 px-4 py-2.5 text-center text-sm font-medium text-stone-200">
                Descargar imagen
              </a>
              <button type="button" onClick={pick} className="w-full py-1 text-xs text-stone-400 underline">
                Usar otra foto
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-stone-500">Subila a tus historias y etiquetanos @{INSTAGRAM_HANDLE}.</p>
            {error && <p className="mt-2 text-center text-xs text-ember-soft">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
