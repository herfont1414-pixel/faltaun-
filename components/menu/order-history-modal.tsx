"use client";

import { useEffect, useState } from "react";
import { X, Clock3 } from "lucide-react";

interface HistoryItem {
  name: string;
  price: number;
  qty: number;
}

interface HistoryOrder {
  id: string;
  items: HistoryItem[];
  total: number;
  status: "pendiente" | "confirmado" | "rechazado";
  progress: "esperando" | "rechazado" | "preparando" | "listo" | "en_camino" | "entregado";
  fulfillment: "retiro" | "delivery";
  etaMinutes: number | null;
  createdAt: string;
}

const PHONE_KEY = "madero_customer_phone";

// Pasos que ve el cliente, en orden. Retiro y delivery tienen el suyo.
const STEPS = {
  delivery: [
    { key: "esperando", label: "Recibido" },
    { key: "preparando", label: "Preparando" },
    { key: "en_camino", label: "En camino" },
    { key: "entregado", label: "Entregado" },
  ],
  retiro: [
    { key: "esperando", label: "Recibido" },
    { key: "preparando", label: "Preparando" },
    { key: "listo", label: "Listo para retirar" },
    { key: "entregado", label: "Entregado" },
  ],
} as const;

const PROGRESS_LABEL: Record<HistoryOrder["progress"], string> = {
  esperando: "Esperando confirmación del local",
  rechazado: "Rechazado",
  preparando: "Preparando tu pedido",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
};

// "listo" en un delivery (ya preparado, esperando al repartidor) se muestra como preparando.
function stepIndex(o: HistoryOrder) {
  const steps = STEPS[o.fulfillment];
  const key = o.fulfillment === "delivery" && o.progress === "listo" ? "preparando" : o.progress;
  return Math.max(0, steps.findIndex((s) => s.key === key));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function OrderHistoryModal({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [orders, setOrders] = useState<HistoryOrder[] | null>(null);
  const [loading, setLoading] = useState(false);

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

  async function load(value: string, silent = false) {
    if (value.trim().length < 6) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/customer/${encodeURIComponent(value.trim())}/orders`);
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      // sin conexión: se mantiene lo que ya se veía y se reintenta en el próximo ciclo.
    }
    if (!silent) setLoading(false);
  }

  // Mientras el modal está abierto, el estado de los pedidos se refresca solo.
  useEffect(() => {
    if (!savedPhone) return;
    const timer = setInterval(() => load(savedPhone, true), 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPhone]);

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
          <h3 className="font-display text-xl text-stone-50">Mis pedidos</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-white/5 p-1.5">
            <X className="h-4 w-4 text-stone-300" />
          </button>
        </div>

        {!savedPhone && orders === null && (
          <div className="space-y-2">
            <p className="text-sm text-stone-400">Ingresá tu WhatsApp para ver tus pedidos anteriores.</p>
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

        {loading && <p className="py-6 text-center text-sm text-stone-400">Buscando...</p>}

        {orders !== null && !loading && (
          <>
            {orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-400">Todavía no hiciste pedidos con este número.</p>
            ) : (
              <div className="space-y-3">
                {orders.map((o) => (
                  <div key={o.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span className="flex items-center gap-1">
                        <Clock3 className="h-3 w-3" /> {fmtDate(o.createdAt)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          o.progress === "entregado"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : o.progress === "rechazado"
                              ? "bg-red-500/15 text-red-300"
                              : o.progress === "esperando"
                                ? "bg-white/10 text-stone-300"
                                : "bg-ember/20 text-ember-soft"
                        }`}
                      >
                        {o.progress === "listo" && o.fulfillment === "retiro"
                          ? "Listo para retirar"
                          : PROGRESS_LABEL[o.progress]}
                        {(o.progress === "preparando" || o.progress === "esperando") && o.etaMinutes
                          ? ` · ~${o.etaMinutes} min`
                          : ""}
                      </span>
                    </div>
                    {o.progress !== "rechazado" && o.status !== "pendiente" && (
                      <div className="mt-3 flex items-start gap-1">
                        {STEPS[o.fulfillment].map((step, i) => {
                          const current = stepIndex(o);
                          return (
                            <div key={step.key} className="flex-1 text-center">
                              <div
                                className={`mx-auto h-1.5 rounded-full ${i <= current ? "bg-ember" : "bg-white/10"}`}
                              />
                              <div
                                className={`mt-1 text-[10px] leading-tight ${
                                  i === current ? "font-semibold text-stone-100" : "text-stone-500"
                                }`}
                              >
                                {step.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-2 space-y-0.5 text-sm text-stone-200">
                      {o.items.map((it, i) => (
                        <div key={i} className="flex justify-between">
                          <span>
                            {it.qty}x {it.name}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 text-sm">
                      <span className="text-stone-400">
                        {o.fulfillment === "delivery" ? "Delivery" : "Retiro en el local"}
                      </span>
                      <span className="font-semibold text-stone-100">
                        ${o.total.toLocaleString("es-AR")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
