"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/components/menu/cart-context";

const DEFAULT_SLOT = { value: "lo_antes_posible", label: "Lo antes posible" };

function buildTimeSlots() {
  const slots: { value: string; label: string }[] = [DEFAULT_SLOT];
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(Math.ceil(next.getMinutes() / 30) * 30 + 30, 0, 0);
  for (let i = 0; i < 6; i++) {
    const slot = new Date(next.getTime() + i * 30 * 60 * 1000);
    slots.push({
      value: slot.toISOString(),
      label: slot.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
    });
  }
  return slots;
}

export function DeliveryToggleCard() {
  const { fulfillment, setFulfillment, scheduledTime, setScheduledTime } = useCart();
  // Los horarios dependen de la hora actual: se calculan en el cliente recién
  // después de montar para que el primer render coincida con el del server
  // (evita el mismatch de hidratación de "ahora" en server vs. cliente).
  const [slots, setSlots] = useState([DEFAULT_SLOT]);

  useEffect(() => {
    setSlots(buildTimeSlots());
  }, []);

  return (
    <div className="relative z-10 mx-auto -mt-10 max-w-3xl px-5">
      <div className="rounded-3xl bg-base-card p-4 shadow-xl shadow-black/30 ring-1 ring-white/5 sm:p-5">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFulfillment("delivery")}
            className={`rounded-2xl py-3 text-sm font-semibold transition ${
              fulfillment === "delivery" ? "bg-ember text-base" : "bg-white/5 text-stone-300 hover:bg-white/10"
            }`}
          >
            Delivery
          </button>
          <button
            type="button"
            onClick={() => setFulfillment("retiro")}
            className={`rounded-2xl py-3 text-sm font-semibold transition ${
              fulfillment === "retiro" ? "bg-ember text-base" : "bg-white/5 text-stone-300 hover:bg-white/10"
            }`}
          >
            Para retirar
          </button>
        </div>

        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-medium text-stone-400">Horario de entrega</label>
          <select
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none"
          >
            {slots.map((slot) => (
              <option key={slot.value} value={slot.value} className="bg-base-card">
                {slot.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
