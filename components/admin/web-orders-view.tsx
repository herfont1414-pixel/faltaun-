"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/admin/format";
import { playBeep } from "@/lib/admin/beep";
import type { WebOrder } from "@/lib/admin/types";

const ETA_OPTIONS = [15, 30, 45];

function waLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function WebOrdersView() {
  const [pending, setPending] = useState<WebOrder[]>([]);
  const [recent, setRecent] = useState<WebOrder[]>([]);
  const [newOrder, setNewOrder] = useState<WebOrder | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const [pendingRes, recentRes] = await Promise.all([
        fetch("/api/admin/web-orders?status=pendiente").then((r) => r.json()),
        fetch("/api/admin/web-orders").then((r) => r.json()),
      ]);
      if (cancelled) return;

      const pendingOrders: WebOrder[] = pendingRes.orders ?? [];
      if (!firstLoad.current) {
        const unseen = pendingOrders.find((o) => !seenIds.current.has(o.id));
        if (unseen) {
          playBeep();
          setNewOrder(unseen);
        }
      }
      firstLoad.current = false;
      pendingOrders.forEach((o) => seenIds.current.add(o.id));

      setPending(pendingOrders);
      setRecent((recentRes.orders ?? []).filter((o: WebOrder) => o.status !== "pendiente"));
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function respond(order: WebOrder, status: "confirmado" | "rechazado", etaMinutes: number | null) {
    await fetch(`/api/admin/web-orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, etaMinutes }),
    });
    setPending((prev) => prev.filter((o) => o.id !== order.id));
    if (newOrder?.id === order.id) setNewOrder(null);

    if (status === "confirmado" && etaMinutes) {
      const message = `Hola ${order.customerName}! Confirmamos tu pedido de Madero Restó, va a estar listo en aprox ${etaMinutes} min. ¡Gracias!`;
      window.open(waLink(order.customerPhone, message), "_blank");
    }
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 14 }}>Pedidos del menú online</h1>

      {newOrder && (
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
          🔔 Nuevo pedido de <strong>{newOrder.customerName}</strong> · {money(newOrder.total)}
        </div>
      )}

      <div className="m-section">
        <div className="m-section-title">Pendientes ({pending.length})</div>
        {pending.length === 0 ? (
          <div className="m-table">
            <div className="m-empty">Sin pedidos pendientes.</div>
          </div>
        ) : (
          pending.map((order) => (
            <div
              key={order.id}
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
                  <strong>{order.customerName}</strong>
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{order.customerPhone}</div>
                </div>
                <div style={{ fontWeight: 700 }}>{money(order.total)}</div>
              </div>

              <div style={{ margin: "10px 0", fontSize: 13 }}>
                {order.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      {it.qty}x {it.name}
                    </span>
                    <span>{money(it.price * it.qty)}</span>
                  </div>
                ))}
              </div>
              {order.notes && (
                <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>
                  Nota: {order.notes}
                </div>
              )}

              <div className="footer-actions">
                {ETA_OPTIONS.map((min) => (
                  <button
                    key={min}
                    type="button"
                    className="btn btn-primary"
                    onClick={() => respond(order, "confirmado", min)}
                  >
                    {min} min
                  </button>
                ))}
                <button type="button" className="btn btn-danger" onClick={() => respond(order, "rechazado", null)}>
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
              <th>Estado</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={3} className="m-empty">
                  Sin pedidos todavía.
                </td>
              </tr>
            ) : (
              recent.map((o) => (
                <tr key={o.id}>
                  <td>{o.customerName}</td>
                  <td>
                    <span className={`pill ${o.status === "confirmado" ? "cerrada" : "encurso"}`}>
                      {o.status === "confirmado" ? `Confirmado · ${o.etaMinutes} min` : "Rechazado"}
                    </span>
                  </td>
                  <td className="m-total">{money(o.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
