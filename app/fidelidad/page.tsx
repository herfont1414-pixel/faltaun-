"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { cycleFilled, cyclePosition, stampsToNext } from "@/lib/admin/loyalty-rewards";

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

interface PublicReward {
  code: string;
  name: string;
  description: string | null;
  firstMilestone: number;
  step: number;
}

interface PublicGrant {
  rewardCode: string;
  rewardName: string;
  rewardDescription: string | null;
  milestone: number;
  status: "disponible" | "canjeado";
  createdAt: string;
  redeemedAt: string | null;
}

const EMOJI: Record<string, string> = { papas: "🍟", burger: "🍔" };
const emojiFor = (code: string) => EMOJI[code] ?? "🎁";

function dateOnly(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR");
}

function money(value: number) {
  return `$${value.toLocaleString("es-AR")}`;
}

const PHONE_KEY = "madero_customer_phone";

export default function FidelidadPage() {
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [rewards, setRewards] = useState<PublicReward[]>([]);
  const [grants, setGrants] = useState<PublicGrant[]>([]);
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
    setRewards(data.rewards ?? []);
    setGrants(data.grants ?? []);
    setLoading(false);
    setSearched(true);
    try {
      localStorage.setItem(PHONE_KEY, value.trim());
    } catch {
      // sin persistencia local, igual mostramos la tarjeta.
    }
  }

  const stamps = account?.stamps ?? 0;
  // La tarjeta se repite cada "step" sellos (15). Los premios marcan su casillero con un ícono.
  const cycle = rewards.length ? Math.max(...rewards.map((r) => r.step)) : 15;
  const filled = cycleFilled(stamps, cycle);
  const markerAt = new Map<number, string>();
  for (const r of rewards) markerAt.set(cyclePosition(r.firstMilestone, cycle), emojiFor(r.code));
  const dots = Array.from({ length: cycle }, (_, i) => ({ on: i < filled, marker: markerAt.get(i + 1) ?? null }));
  const available = grants.filter((g) => g.status === "disponible");
  const redeemedGrants = grants.filter((g) => g.status === "canjeado");
  const next = account && rewards.length ? stampsToNext(rewards, stamps) : null;

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
          Sumá un sello cada vez que confirmamos un pedido hecho desde este menú y ganá premios para canjear en el
          local.
        </p>
        {rewards.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-stone-300">
            {[...rewards]
              .sort((a, b) => a.firstMilestone - b.firstMilestone)
              .map((r) => (
                <li key={r.code}>
                  {emojiFor(r.code)} <strong className="text-stone-100">{r.firstMilestone} sellos:</strong> {r.name}
                </li>
              ))}
            <li className="text-xs text-stone-500">Y se repite: seguís sumando sin perder tus sellos ni tus premios.</li>
          </ul>
        )}

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
                {dots.map(({ on, marker }, i) => (
                  <div
                    key={i}
                    className={`flex aspect-square items-center justify-center rounded-full border backdrop-blur-sm ${
                      on ? "border-ember bg-ember/25" : marker ? "border-ember/40 bg-white/5" : "border-white/10 bg-white/5"
                    }`}
                  >
                    {marker ? (
                      <span className={`text-base ${on ? "" : "opacity-60"}`}>{marker}</span>
                    ) : (
                      <Star
                        className={`h-4 w-4 ${on ? "text-ember-soft" : "text-stone-600"}`}
                        fill={on ? "currentColor" : "none"}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="relative mt-3 text-xs text-stone-400">
                {stamps} sello{stamps === 1 ? "" : "s"} acumulados
              </p>

              {account.orderCount > 0 && (
                <p className="relative mt-5 text-xs text-stone-400">
                  {account.orderCount} pedido{account.orderCount === 1 ? "" : "s"} · {money(account.totalSpent)}{" "}
                  acumulado
                </p>
              )}
            </div>

            {available.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-ember-soft">
                  {available.length === 1 ? "¡Ya tenés un premio disponible!" : `¡Tenés ${available.length} premios disponibles!`}
                </p>
                {available.map((g) => (
                  <div key={`${g.rewardCode}-${g.milestone}`} className="rounded-2xl border border-ember/40 bg-ember/10 p-4 text-sm">
                    <p className="font-semibold text-stone-50">
                      {emojiFor(g.rewardCode)} {g.rewardName}
                    </p>
                    {g.rewardDescription && <p className="mt-1 text-stone-300">{g.rewardDescription}</p>}
                    <p className="mt-2 text-xs text-stone-400">Mostrá tu tarjeta en Madero Restó para canjearlo.</p>
                  </div>
                ))}
              </div>
            )}

            {next && (
              <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-stone-400">
                Te faltan <strong className="text-stone-200">{next.remaining}</strong> sello
                {next.remaining === 1 ? "" : "s"} para tu próximo premio: {emojiFor(next.rule.code)} {next.rule.name} (a los{" "}
                {next.milestone} sellos).
              </div>
            )}

            {redeemedGrants.length > 0 && (
              <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-stone-500">
                <p className="mb-1 font-semibold text-stone-400">Premios ya canjeados</p>
                {redeemedGrants.map((g) => (
                  <p key={`${g.rewardCode}-${g.milestone}`}>
                    {emojiFor(g.rewardCode)} {g.rewardName} · {dateOnly(g.redeemedAt)}
                  </p>
                ))}
              </div>
            )}
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
