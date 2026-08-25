"use client";

import { useState } from "react";
import { CalendarDays, Clock, Users } from "lucide-react";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { buildReservationInquiry } from "@/lib/whatsapp";

export function ReservationForm() {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [guests, setGuests] = useState(2);

  const isValid = Boolean(date && time && guests > 0);

  return (
    <section id="reservas" className="px-5 py-8">
      <h2 className="font-display text-2xl text-stone-50">Reservá tu mesa</h2>
      <p className="mt-1 text-sm text-stone-400">
        Elegí día, horario y cantidad de personas. Confirmamos por WhatsApp.
      </p>

      <div className="mt-5 space-y-3 rounded-xl2 border border-white/5 bg-base-card p-4">
        <label className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5">
          <CalendarDays className="h-4 w-4 shrink-0 text-ember" strokeWidth={1.75} />
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full bg-transparent text-sm text-stone-100 outline-none [color-scheme:dark]"
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5">
          <Clock className="h-4 w-4 shrink-0 text-ember" strokeWidth={1.75} />
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="w-full bg-transparent text-sm text-stone-100 outline-none [color-scheme:dark]"
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5">
          <Users className="h-4 w-4 shrink-0 text-ember" strokeWidth={1.75} />
          <input
            type="number"
            min={1}
            max={20}
            value={guests}
            onChange={(event) => setGuests(Number(event.target.value))}
            className="w-full bg-transparent text-sm text-stone-100 outline-none"
          />
        </label>

        <WhatsAppButton
          href={buildReservationInquiry(date, time, guests)}
          label="Confirmar reserva por WhatsApp"
          className={`w-full ${!isValid ? "pointer-events-none opacity-40" : ""}`}
        />
      </div>
    </section>
  );
}
