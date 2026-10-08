"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Star, X } from "lucide-react";

const PHONE_KEY = "madero_customer_phone";
const LOYALTY_THRESHOLD = 10;

export function LoyaltyBanner() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const router = useRouter();

  function goToCard() {
    const value = phone.trim();
    if (value.length < 6) return;
    try {
      localStorage.setItem(PHONE_KEY, value);
    } catch {
      // sin acceso a localStorage, igual navegamos: la página de fidelidad
      // deja buscar el teléfono a mano.
    }
    router.push("/fidelidad");
  }

  return (
    <>
      <div className="mx-auto mt-6 max-w-3xl px-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3.5 rounded-2xl border border-ember/25 bg-gradient-to-r from-ember/15 via-ember/10 to-transparent p-4 text-left transition hover:border-ember/40 active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ember/20 text-ember-soft">
            <Star className="h-5 w-5" fill="currentColor" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-stone-50">Sumate a Fidelidad Madero</span>
            <span className="block text-xs text-stone-400">
              Ingresá tu WhatsApp y empezá a ganar premios con cada pedido
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-ember px-3.5 py-2 text-xs font-semibold text-base">
            Quiero mi tarjeta
          </span>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-base-card p-6 sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/20 text-ember-soft">
                  <Gift className="h-5 w-5" />
                </span>
                <h3 className="font-display text-xl text-stone-50">Fidelidad Madero</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="rounded-full bg-white/5 p-1.5 text-stone-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-stone-400">
              Sumás <strong className="text-stone-200">1 sello</strong> cada vez que confirmamos un pedido
              hecho desde este menú. Al llegar a los{" "}
              <strong className="text-stone-200">{LOYALTY_THRESHOLD} sellos</strong>, tenés un premio listo
              para canjear en el local.
            </p>

            <div className="mt-5 space-y-2">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goToCard()}
                placeholder="Tu WhatsApp"
                inputMode="tel"
                className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm text-stone-100 outline-none placeholder:text-stone-500"
              />
              <button
                type="button"
                onClick={goToCard}
                disabled={phone.trim().length < 6}
                className="w-full rounded-full bg-ember px-5 py-3 text-sm font-medium text-base transition hover:bg-ember-soft disabled:opacity-40"
              >
                Ver mi tarjeta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
