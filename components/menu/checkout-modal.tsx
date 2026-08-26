"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCart } from "@/components/menu/cart-context";

interface CheckoutModalProps {
  onClose: () => void;
}

export function CheckoutModal({ onClose }: CheckoutModalProps) {
  const { items, changeQty, total, clear } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!name.trim() || !phone.trim()) {
      setError("Completá tu nombre y tu WhatsApp");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone,
        notes: notes || null,
        items: items.map((it) => ({ name: it.name, qty: it.qty })),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No pudimos enviar tu pedido");
      return;
    }
    setSent(true);
    clear();
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
          <h3 className="font-display text-xl text-stone-50">
            {sent ? "¡Pedido enviado!" : "Tu pedido"}
          </h3>
          <button type="button" onClick={onClose} className="rounded-full bg-white/5 p-1.5">
            <X className="h-4 w-4 text-stone-300" />
          </button>
        </div>

        {sent ? (
          <p className="py-6 text-center text-sm text-stone-300">
            Te vamos a confirmar por WhatsApp en breve con el tiempo de espera. ¡Gracias!
          </p>
        ) : (
          <>
            <div className="mb-4 space-y-2">
              {items.map((it) => (
                <div key={it.name} className="flex items-center gap-3 text-sm">
                  <div className="qty-ctrl flex items-center gap-1 rounded-lg bg-white/5 p-1">
                    <button
                      type="button"
                      onClick={() => changeQty(it.name, -1)}
                      className="h-6 w-6 rounded bg-white/10 font-bold text-stone-100"
                    >
                      −
                    </button>
                    <span className="min-w-[16px] text-center font-semibold">{it.qty}</span>
                    <button
                      type="button"
                      onClick={() => changeQty(it.name, 1)}
                      className="h-6 w-6 rounded bg-white/10 font-bold text-stone-100"
                    >
                      +
                    </button>
                  </div>
                  <span className="flex-1 text-stone-200">{it.name}</span>
                  <span className="font-medium text-stone-300">
                    ${(it.price * it.qty).toLocaleString("es-AR")}
                  </span>
                </div>
              ))}
            </div>

            <div className="mb-4 flex justify-between border-t border-white/10 pt-3 text-sm font-semibold text-stone-100">
              <span>Total</span>
              <span>${total.toLocaleString("es-AR")}</span>
            </div>

            <div className="space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-500"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Tu WhatsApp (ej: 5493751123456)"
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-500"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas (opcional)"
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-500"
              />
            </div>

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="mt-4 w-full rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-base transition hover:bg-ember-soft disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar pedido"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
