"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";

interface LoyaltyAccount {
  phone: string;
  name: string | null;
  stamps: number;
  redeemed: number;
  orderCount: number;
  totalSpent: number;
  rewardsAvailable: number;
  stampsToNextReward: number;
}

function money(value: number) {
  return `$${value.toLocaleString("es-AR")}`;
}

const PHONE_KEY = "madero_customer_phone";

export default function FidelidadPage() {
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PHONE_KEY);
      if (stored) {
        setSavedPhone(stored);
        setPhone(stored);
        load(stored);
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
    try {
      localStorage.setItem(PHONE_KEY, value.trim());
    } catch {
      // sin persistencia local, igual mostramos la tarjeta.
    }
  }

  const stamps = account?.stamps ?? 0;
  const filled = stamps % threshold;
  const dots = Array.from({ length: threshold }, (_, i) => i < filled);

  return (
    <main className="flex min-h-screen flex-col items-center bg-base px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-200">
          <ArrowLeft className="h-4 w-4" />
          Volver al menú
        </Link>

        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ember-soft">Fidelidad</p>
        <h1 className="mt-1 font-display text-3xl text-stone-50">Tu tarjeta VIP</h1>
        <p className="mt-2 text-sm text-stone-400">
          Sumá un sello cada vez que confirmamos un pedido hecho desde este menú. Cada {threshold} sellos, un
          premio para canjear en el local.
        </p>

        {!savedPhone && !searched && (
          <div className="mt-6 space-y-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Tu WhatsApp"
              className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm text-stone-100 outline-none placeholder:text-stone-500"
            />
            <button
              type="button"
              onClick={() => load(phone)}
              className="w-full rounded-full bg-ember px-5 py-3 text-sm font-medium text-base transition hover:bg-ember-soft"
            >
              Ver mi tarjeta
            </button>
          </div>
        )}

        {loading && <p className="mt-8 text-center text-sm text-stone-400">Cargando...</p>}

        {account && !loading && (
          <div className="mt-6">
            {/* Tarjeta VIP: esquinas muy redondeadas, gradiente sutil, glassmorphism */}
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-ember/30 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-ember-deep/30 blur-3xl" />

              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-300">
                    Madero Restó · VIP
                  </p>
                  <p className="mt-1.5 font-display text-xl text-white">{account.name || "Cliente"}</p>
                </div>
                <Star className="h-8 w-8 text-ember-soft" fill="currentColor" />
              </div>
              <p className="relative mt-5 font-mono text-sm tracking-widest text-stone-300">
                {account.phone.replace(/(\d{3})(?=\d)/g, "$1 ").trim()}
              </p>

              <div className="relative mt-6 grid grid-cols-5 gap-2.5">
                {dots.map((on, i) => (
                  <div
                    key={i}
                    className={`flex aspect-square items-center justify-center rounded-full border backdrop-blur-sm ${
                      on ? "border-ember bg-ember/25" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <Star
                      className={`h-4 w-4 ${on ? "text-ember-soft" : "text-stone-600"}`}
                      fill={on ? "currentColor" : "none"}
                    />
                  </div>
                ))}
              </div>

              {account.orderCount > 0 && (
                <p className="relative mt-5 text-xs text-stone-400">
                  {account.orderCount} pedido{account.orderCount === 1 ? "" : "s"} · {money(account.totalSpent)}{" "}
                  acumulado
                </p>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm">
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
            </div>
          </div>
        )}

        {searched && !account && !loading && (
          <p className="mt-8 text-center text-sm text-stone-400">
            No encontramos una tarjeta para ese número todavía — hacé tu primer pedido para empezar a sumar
            sellos.
          </p>
        )}
      </div>
    </main>
  );
}
