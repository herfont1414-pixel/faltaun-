"use client";

import { useState } from "react";
import { CalendarDays, Clock, Users } from "lucide-react";

export function ReservationForm() {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const isValid = Boolean(date && time && guests > 0 && name.trim() && phone.trim());

  async function submit() {
    if (!isValid) {
      setError("Completá fecha, horario, personas, tu nombre y tu WhatsApp");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone,
        partySize: guests,
        date,
        time,
        notes: notes || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No pudimos enviar tu reserva");
      return;
    }
    setSent(true);
  }

  return (
    <section id="reservas" className="px-5 py-8">
      <h2 className="font-display text-2xl text-stone-50">Reservá tu mesa</h2>
      <p className="mt-1 text-sm text-stone-400">
        Elegí día, horario y cantidad de personas. Confirmamos por WhatsApp.
      </p>

      <div className="mt-5 space-y-3 rounded-xl2 border border-white/5 bg-base-card p-4">
        {sent ? (
          <p className="py-6 text-center text-sm text-stone-300">
            ¡Listo! Recibimos tu reserva. Te confirmamos por WhatsApp en breve.
          </p>
        ) : (
          <>
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

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="w-full rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-base transition hover:bg-ember-soft disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Reservar"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
