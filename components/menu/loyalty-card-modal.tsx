"use client";

import { useEffect, useState } from "react";
import { X, Star } from "lucide-react";

interface LoyaltyAccount {
  phone: string;
  stamps: number;
  redeemed: number;
  rewardsAvailable: number;
  stampsToNextReward: number;
}

const PHONE_KEY = "madero_customer_phone";
const NAME_KEY = "madero_customer_name";

export function LoyaltyCardModal({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    try {
      const storedPhone = localStorage.getItem(PHONE_KEY);
      const storedName = localStorage.getItem(NAME_KEY);
      if (storedName) setName(storedName);
      if (storedPhone) {
        setSavedPhone(storedPhone);
        setPhone(storedPhone);
        load(storedPhone);
      }
    } catch {
      // sin acceso a localStorage, el cliente puede buscar su teléfono a mano.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(value: string) {
    if (value.trim().length < 6) return;
    setLoading(true);
    const res = await fetch(`/api/customer/${encodeURIComponent(value.trim())}/loyalty`);
    const data = await res.json();
    setAccount(data.account ?? null);
    setThreshold(data.threshold ?? 10);
    setLoading(false);
    setSearched(true);
  }

  const stamps = account?.stamps ?? 0;
  const filled = stamps % threshold;
  const dots = Array.from({ length: threshold }, (_, i) => i < filled);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-base-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl text-stone-50">Mi tarjeta Madero</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-white/5 p-1.5">
            <X className="h-4 w-4 text-stone-300" />
          </button>
        </div>

        {!savedPhone && !searched && (
          <div className="space-y-2">
            <p className="text-sm text-stone-400">Ingresá tu WhatsApp para ver tu tarjeta de fidelidad.</p>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Tu WhatsApp"
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-500"
            />
            <button
              type="button"
              onClick={() => load(phone)}
              className="w-full rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-base transition hover:bg-ember-soft"
            >
              Buscar
            </button>
          </div>
        )}

        {loading && <p className="py-6 text-center text-sm text-stone-400">Cargando...</p>}

        {account && !loading && (
          <>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ember-deep via-ember to-ember-soft p-5 text-base shadow-lg">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-base/70">
                    Madero Restó
                  </p>
                  <p className="mt-1 font-display text-lg">{name || "Cliente"}</p>
                </div>
                <Star className="h-7 w-7 text-base/80" fill="currentColor" />
              </div>
              <p className="mt-4 font-mono text-sm tracking-widest text-base/80">
                {account.phone.replace(/(\d{3})(?=\d)/g, "$1 ").trim()}
              </p>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-stone-300">
                <span>Sellos acumulados</span>
                <span className="font-semibold text-stone-100">
                  {filled}/{threshold}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {dots.map((on, i) => (
                  <div
                    key={i}
                    className={`flex aspect-square items-center justify-center rounded-full border ${
                      on ? "border-ember bg-ember/20" : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <Star
                      className={`h-4 w-4 ${on ? "text-ember-soft" : "text-stone-700"}`}
                      fill={on ? "currentColor" : "none"}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
              {account.rewardsAvailable > 0 ? (
                <p className="font-semibold text-ember-soft">
                  🎉 Tenés {account.rewardsAvailable} premio{account.rewardsAvailable > 1 ? "s" : ""} listo
                  {account.rewardsAvailable > 1 ? "s" : ""} para canjear — mostrá esta pantalla en el local.
                </p>
              ) : (
                <p className="text-stone-400">
                  Te faltan <strong className="text-stone-200">{account.stampsToNextReward}</strong> sello
                  {account.stampsToNextReward === 1 ? "" : "s"} para tu próximo premio.
                </p>
              )}
              <p className="mt-1 text-xs text-stone-500">
                Sumás un sello cada vez que confirmamos un pedido hecho desde este menú.
              </p>
            </div>
          </>
        )}

        {searched && !account && !loading && (
          <p className="py-6 text-center text-sm text-stone-400">
            No encontramos una tarjeta para ese número todavía — hacé tu primer pedido para empezar a sumar
            sellos.
          </p>
        )}
      </div>
    </div>
  );
}
