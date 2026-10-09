"use client";

import { whatsappDigits } from "@/lib/phone";
import { useEffect, useRef, useState } from "react";
import { playBeep } from "@/lib/admin/beep";
import type { Reservation } from "@/lib/admin/types";

function waLink(phone: string, message: string) {
  const digits = whatsappDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function fmtDate(dateStr: string, timeStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const dateLabel = date.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
  return `${dateLabel} · ${timeStr}`;
}

export function ReservationsView() {
  const [pending, setPending] = useState<Reservation[]>([]);
  const [recent, setRecent] = useState<Reservation[]>([]);
  const [newReservation, setNewReservation] = useState<Reservation | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const [pendingRes, recentRes] = await Promise.all([
        fetch("/api/admin/reservations?status=pendiente").then((r) => r.json()),
        fetch("/api/admin/reservations").then((r) => r.json()),
      ]);
      if (cancelled) return;

      const pendingReservations: Reservation[] = pendingRes.reservations ?? [];
      if (!firstLoad.current) {
        const unseen = pendingReservations.find((r) => !seenIds.current.has(r.id));
        if (unseen) {
          playBeep();
          setNewReservation(unseen);
        }
      }
      firstLoad.current = false;
      pendingReservations.forEach((r) => seenIds.current.add(r.id));

      setPending(pendingReservations);
      setRecent((recentRes.reservations ?? []).filter((r: Reservation) => r.status !== "pendiente"));
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function respond(reservation: Reservation, status: "confirmada" | "rechazada") {
    await fetch(`/api/admin/reservations/${reservation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setPending((prev) => prev.filter((r) => r.id !== reservation.id));
    if (newReservation?.id === reservation.id) setNewReservation(null);

    const message =
      status === "confirmada"
        ? `Hola ${reservation.customerName}! Confirmamos tu reserva en Madero Restó para ${reservation.partySize} persona(s) el ${reservation.date} a las ${reservation.time}. ¡Te esperamos!`
        : `Hola ${reservation.customerName}, lamentablemente no podemos confirmar tu reserva del ${reservation.date} a las ${reservation.time}. ¡Disculpá las molestias!`;
    window.open(waLink(reservation.customerPhone, message), "_blank");
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 14 }}>Reservas</h1>

      {newReservation && (
        <div
          style={{
            position: "fixed",
            top: 70,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 70,
            background: "#2c2c2a",
            color: "#fff",
            padding: "14px 20px",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          🔔 Nueva reserva de <strong>{newReservation.customerName}</strong> ·{" "}
          {fmtDate(newReservation.date, newReservation.time)}
        </div>
      )}

      <div className="m-section">
        <div className="m-section-title">Pendientes ({pending.length})</div>
        {pending.length === 0 ? (
          <div className="m-table">
            <div className="m-empty">Sin reservas pendientes.</div>
          </div>
        ) : (
          pending.map((r) => (
            <div
              key={r.id}
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: 16,
                marginBottom: 12,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong>{r.customerName}</strong>
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{r.customerPhone}</div>
                </div>
                <div style={{ fontWeight: 700 }}>{fmtDate(r.date, r.time)}</div>
              </div>

              <div style={{ margin: "10px 0", fontSize: 13 }}>{r.partySize} persona(s)</div>
              {r.notes && (
                <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>
                  Nota: {r.notes}
                </div>
              )}

              <div className="footer-actions">
                <button type="button" className="btn btn-primary" onClick={() => respond(r, "confirmada")}>
                  Confirmar
                </button>
                <button type="button" className="btn btn-danger" onClick={() => respond(r, "rechazada")}>
                  Rechazar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="m-section">
        <div className="m-section-title">Historial reciente</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Fecha</th>
              <th style={{ textAlign: "right" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={3} className="m-empty">
                  Sin reservas todavía.
                </td>
              </tr>
            ) : (
              recent.map((r) => (
                <tr key={r.id}>
                  <td>{r.customerName}</td>
                  <td>{fmtDate(r.date, r.time)}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`pill ${r.status === "confirmada" ? "cerrada" : "encurso"}`}>
                      {r.status === "confirmada" ? "Confirmada" : "Rechazada"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
