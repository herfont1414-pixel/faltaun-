"use client";

import { useEffect, useState } from "react";
import { Bike, ChevronDown, Clock, ShoppingBag } from "lucide-react";
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

  const tab = (active: boolean) =>
    `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition ${
      active
        ? "bg-gradient-to-r from-ember to-ember-soft text-base shadow-lg shadow-ember/20"
        : "text-stone-300 hover:bg-white/5"
    }`;

  return (
    <div className="relative z-10 mx-auto mt-2 max-w-3xl px-5">
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-base-card p-1.5">
        <button type="button" onClick={() => setFulfillment("delivery")} className={tab(fulfillment === "delivery")}>
          <Bike className="h-6 w-6 shrink-0" strokeWidth={1.6} />
          <span>
            <span className="block text-sm font-semibold leading-tight">Delivery</span>
            <span className="block text-[11px] opacity-75">A domicilio</span>
          </span>
        </button>
        <button type="button" onClick={() => setFulfillment("retiro")} className={tab(fulfillment === "retiro")}>
          <ShoppingBag className="h-6 w-6 shrink-0" strokeWidth={1.6} />
          <span>
            <span className="block text-sm font-semibold leading-tight">Para retirar</span>
            <span className="block text-[11px] opacity-75">En el local</span>
          </span>
        </button>
      </div>

      <div className="relative mt-2.5">
        <Clock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ember-soft" strokeWidth={1.8} />
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <select
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
          aria-label="Horario de entrega"
          className="w-full appearance-none rounded-xl border border-white/10 bg-base-card py-3 pl-10 pr-9 text-sm text-stone-100 outline-none"
        >
          {slots.map((slot) => (
            <option key={slot.value} value={slot.value} className="bg-base-card">
              {slot.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
