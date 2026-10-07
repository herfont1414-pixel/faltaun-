"use client";

import { useEffect, useRef, useState } from "react";
import { playBeep } from "@/lib/admin/beep";
import type { KitchenStatus, KitchenTicket } from "@/lib/admin/types";

const COLUMNS: { status: KitchenStatus; label: string; next: KitchenStatus | null; nextLabel: string }[] = [
  { status: "pendiente", label: "Pendiente", next: "preparando", nextLabel: "Empezar" },
  { status: "preparando", label: "En preparación", next: "listo", nextLabel: "Listo" },
  { status: "listo", label: "Listo", next: "despachado", nextLabel: "Retirar" },
];

function originLabel(ticket: KitchenTicket) {
  if (ticket.origin === "mesa") return `Mesa ${ticket.tableNumber}`;
  if (ticket.origin === "mostrador") return "Mostrador";
  return ticket.customerName ? `Web · ${ticket.customerName}` : "Web";
}

function elapsedLabel(sentAt: string, now: number) {
  const diffSec = Math.max(0, Math.floor((now - new Date(sentAt).getTime()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function KdsBoard() {
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [now, setNow] = useState(Date.now());
  const seenIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const data = await fetch("/api/admin/kitchen").then((r) => r.json());
      if (cancelled) return;
      const list: KitchenTicket[] = data.tickets ?? [];

      if (!firstLoad.current) {
        const unseen = list.find((t) => !seenIds.current.has(`${t.source}:${t.id}`));
        if (unseen) playBeep();
      }
      firstLoad.current = false;
      list.forEach((t) => seenIds.current.add(`${t.source}:${t.id}`));

      setTickets(list);
    }

    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  async function advance(ticket: KitchenTicket, status: KitchenStatus) {
    if (status === "despachado") {
      setTickets((prev) => prev.filter((t) => !(t.id === ticket.id && t.source === ticket.source)));
    } else {
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id && t.source === ticket.source ? { ...t, kitchenStatus: status } : t))
      );
    }
    await fetch(`/api/admin/kitchen/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: ticket.source, status }),
    });
  }

  return (
    <div className="admin-root kds-root">
      <div className="kds-header">
        <span>🍳 Cocina</span>
        <span className="kds-clock">
          {new Date(now).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="kds-columns">
        {COLUMNS.map((col) => {
          const colTickets = tickets.filter((t) => t.kitchenStatus === col.status);
          return (
            <div key={col.status} className={`kds-col kds-col-${col.status}`}>
              <div className="kds-col-title">
                {col.label} ({colTickets.length})
              </div>
              <div className="kds-col-body">
                {colTickets.length === 0 && <div className="kds-empty">Sin pedidos</div>}
                {colTickets.map((t) => (
                  <div key={`${t.source}:${t.id}`} className="kds-card">
                    <div className="kds-card-top">
                      <span className="kds-origin">{originLabel(t)}</span>
                      <span className="kds-timer">{elapsedLabel(t.sentAt, now)}</span>
                    </div>
                    <div className="kds-items">
                      {t.items.map((it, i) => (
                        <div key={i} className="kds-item">
                          <span className="kds-item-qty">{it.qty}x</span> {it.name}
                        </div>
                      ))}
                    </div>
                    {col.next && (
                      <button type="button" className="kds-btn" onClick={() => advance(t, col.next!)}>
                        {col.nextLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
