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
  fulfillment: "retiro" | "delivery";
  etaMinutes: number | null;
  createdAt: string;
}

const PHONE_KEY = "madero_customer_phone";

const STATUS_LABEL: Record<HistoryOrder["status"], string> = {
  pendiente: "Esperando confirmación",
  confirmado: "Confirmado",
  rechazado: "Rechazado",
};

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

  async function load(value: string) {
    if (value.trim().length < 6) return;
    setLoading(true);
    const res = await fetch(`/api/customer/${encodeURIComponent(value.trim())}/orders`);
    const data = await res.json();
    setOrders(data.orders ?? []);
    setLoading(false);
  }

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
                          o.status === "confirmado"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : o.status === "rechazado"
                              ? "bg-red-500/15 text-red-300"
                              : "bg-white/10 text-stone-300"
                        }`}
                      >
                        {STATUS_LABEL[o.status]}
                        {o.status === "confirmado" && o.etaMinutes ? ` · ${o.etaMinutes} min` : ""}
                      </span>
                    </div>
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
