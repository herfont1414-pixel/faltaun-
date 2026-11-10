"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Gift, Star, X } from "lucide-react";

const PHONE_KEY = "madero_customer_phone";

interface Rule {
  code: string;
  name: string;
  firstMilestone: number;
}
const EMOJI: Record<string, string> = { papas: "🍟", burger: "🍔" };

export function LoyaltyBanner() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const router = useRouter();
  // Si ya cargó su teléfono antes (en un pedido o en la tarjeta), va directo a sus sellos.
  // Solo se mira el teléfono guardado en el celular: no se consulta la base al abrir el menú.
  const [hasCard, setHasCard] = useState(false);
  useEffect(() => {
    try {
      setHasCard(Boolean(localStorage.getItem(PHONE_KEY)));
    } catch {
      // sin acceso a localStorage: se muestra la invitación a sumarse.
    }
  }, []);

  function openCard() {
    if (hasCard) router.push("/fidelidad");
    else setOpen(true);
  }

  useEffect(() => {
    if (!open || rules.length > 0) return;
    fetch("/api/loyalty/rules")
      .then((res) => res.json())
      .then((data: { rewards?: Rule[] }) => setRules(data.rewards ?? []))
      .catch(() => {});
  }, [open, rules.length]);

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
      <div className="mx-auto mt-4 max-w-3xl px-5">
        <button
          type="button"
          onClick={openCard}
          aria-label="Fidelidad Madero: ver mi tarjeta de sellos"
          className="loyalty-card group relative block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-ember-deep via-ember to-ember-soft p-4 text-left shadow-[0_10px_30px_-10px_rgba(217,123,63,0.7)] transition active:scale-[0.99] sm:p-5"
        >
          {/* Brillo que pasa de vez en cuando, para que llame la atención sin molestar. */}
          <span aria-hidden className="loyalty-card-shine pointer-events-none absolute inset-0" />
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <span aria-hidden className="pointer-events-none absolute -bottom-16 right-16 h-36 w-36 rounded-full bg-black/10" />

          <span className="relative flex items-start justify-between gap-3">
            <span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-white/75">Madero · Club</span>
              <span className="mt-0.5 block font-display text-2xl leading-tight text-white drop-shadow-sm sm:text-[1.7rem]">
                Tarjeta VIP
              </span>
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/40">
              <Star className="h-5 w-5" fill="currentColor" strokeWidth={1.5} />
            </span>
          </span>

          <span className="relative mt-3 flex items-center gap-1.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`flex h-7 w-7 items-center justify-center rounded-full ring-1 ${
                  i < 2 ? "bg-white text-ember-deep ring-white" : "bg-white/15 text-white/60 ring-white/40"
                }`}
              >
                <Star className="h-3.5 w-3.5" fill={i < 2 ? "currentColor" : "none"} strokeWidth={2} />
              </span>
            ))}
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-sm ring-2 ring-white">🎁</span>
          </span>

          <span className="relative mt-3 flex items-end justify-between gap-3">
            <span className="text-[13px] leading-snug text-white/95">
              Sumá un sello por cada pedido y
              <br />
              <strong className="font-semibold text-white">ganá papas y hamburguesas gratis 🍟🍔</strong>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-ember-deep shadow-sm transition group-hover:translate-x-0.5">
              {hasCard ? "Ver mis sellos" : "Sumarme"}
              <ChevronRight className="h-4 w-4" />
            </span>
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
              Sumás <strong className="text-stone-200">1 sello</strong> por cada compra (uno por día): los pedidos
              de este menú y también en el local, dando tu WhatsApp. Con los sellos ganás premios para canjear en el local:
            </p>
            {rules.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-stone-300">
                {[...rules]
                  .sort((a, b) => a.firstMilestone - b.firstMilestone)
                  .map((r) => (
                    <li key={r.code}>
                      {EMOJI[r.code] ?? "🎁"} <strong className="text-stone-100">{r.firstMilestone} sellos:</strong> {r.name}
                    </li>
                  ))}
              </ul>
            )}

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
