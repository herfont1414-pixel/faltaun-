"use client";

import { whatsappDigits } from "@/lib/phone";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/admin/format";
import { playBeep } from "@/lib/admin/beep";
import { osmLink } from "@/lib/geo";
import { buildOrderConfirmationMessage } from "@/lib/order-messages";
import type { WebOrder } from "@/lib/admin/types";

const ETA_OPTIONS = [15, 30, 45, 60];

const REJECT_REASONS = [
  { value: "Sin stock", label: "Sin stock" },
  { value: "Fuera de zona", label: "Fuera de zona" },
  { value: "Horario de cierre", label: "Horario de cierre" },
  { value: "Otro", label: "Otro" },
];

function waLink(phone: string, message: string) {
  const digits = whatsappDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function WebOrdersView({ onOpenOrder }: { onOpenOrder: (webOrderId: string) => void }) {
  const [pending, setPending] = useState<WebOrder[]>([]);
  const [recent, setRecent] = useState<WebOrder[]>([]);
  const [newOrder, setNewOrder] = useState<WebOrder | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<WebOrder | null>(null);
  const [rejectTarget, setRejectTarget] = useState<WebOrder | null>(null);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0].value);
  const [rejectOther, setRejectOther] = useState("");
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
    const res = await fetch(`/api/admin/web-orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, etaMinutes }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error ?? "No se pudo confirmar el pedido" };
    }
    setPending((prev) => prev.filter((o) => o.id !== order.id));
    if (newOrder?.id === order.id) setNewOrder(null);
    return { ok: true };
  }

  function confirmAccept(minutes: number) {
    if (!acceptTarget) return;
    const order = acceptTarget;
    setAcceptTarget(null);
    const message = buildOrderConfirmationMessage(order, minutes);
    window.open(waLink(order.customerPhone, message), "_blank");
    respond(order, "confirmado", minutes).then((result) => {
      if (!result.ok) {
        alert(
          `No se pudo confirmar el pedido de ${order.customerName}: ${result.error}. Avisale por WhatsApp que hubo un problema.`
        );
      }
    });
  }

  function confirmReject() {
    if (!rejectTarget) return;
    const order = rejectTarget;
    const reason = rejectReason === "Otro" ? rejectOther.trim() || "Otro motivo" : rejectReason;
    setRejectTarget(null);
    setRejectReason(REJECT_REASONS[0].value);
    setRejectOther("");
    const message = `Hola, lamentablemente no podemos procesar tu pedido en este momento debido a: ${reason}.`;
    window.open(waLink(order.customerPhone, message), "_blank");
    respond(order, "rechazado", null);
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

              <div style={{ margin: "8px 0", fontSize: 12.5 }}>
                <span className={`pill ${order.fulfillment === "delivery" ? "encurso" : "cerrada"}`}>
                  {order.fulfillment === "delivery" ? "Delivery" : "Retira en el local"}
                </span>
                {order.paymentMethod && (
                  <span
                    className={`pill ${order.paymentMethod === "transferencia" ? "encurso" : "cerrada"}`}
                    style={{ marginLeft: 8 }}
                  >
                    {order.paymentMethod === "transferencia"
                      ? "Transferencia · pedile el comprobante"
                      : `${order.fulfillment === "delivery" ? "Efectivo al recibir" : "Efectivo al retirar"}${
                          order.cashGiven ? ` · con ${money(order.cashGiven)}` : ""
                        }`}
                  </span>
                )}
                {order.fulfillment === "delivery" && order.customerAddress && (
                  <span style={{ marginLeft: 8, color: "var(--text-dim)" }}>
                    {order.customerAddress}
                    {order.deliveryZone ? ` · ${order.deliveryZone}` : ""}
                    {order.shippingCost > 0 ? ` · envío ${money(order.shippingCost)}` : ""}
                    {order.deliveryLat !== null && order.deliveryLng !== null && (
                      <>
                        {" · "}
                        <a
                          href={osmLink({ lat: order.deliveryLat, lng: order.deliveryLng })}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontWeight: 600 }}
                        >
                          Ver en mapa
                        </a>
                      </>
                    )}
                  </span>
                )}
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
                <button type="button" className="btn btn-primary" onClick={() => setAcceptTarget(order)}>
                  Aceptar
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setRejectTarget(order)}>
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
              <th />
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={4} className="m-empty">
                  Sin pedidos todavía.
                </td>
              </tr>
            ) : (
              recent.map((o) => (
                <tr key={o.id}>
                  <td>{o.customerName}</td>
                  <td>
                    <span className={`pill ${o.status === "confirmado" ? "cerrada" : "encurso"}`}>
                      {o.status === "confirmado" ? `Aceptado · ${o.etaMinutes} min` : "Rechazado"}
                    </span>
                  </td>
                  <td className="m-total">{money(o.total)}</td>
                  <td style={{ textAlign: "right" }}>
                    {o.status === "confirmado" &&
                      (o.orderStatus === "cerrada" ? (
                        <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Cobrado</span>
                      ) : (
                        <button type="button" className="btn btn-primary" onClick={() => onOpenOrder(o.id)}>
                          Abrir pedido
                        </button>
                      ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {acceptTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setAcceptTarget(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: 14, padding: 20, width: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Tiempo estimado</div>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
              Pedido de {acceptTarget.customerName}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ETA_OPTIONS.map((min) => (
                <button
                  key={min}
                  type="button"
                  className="btn btn-primary"
                  onClick={() => confirmAccept(min)}
                >
                  {min} min
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => setAcceptTarget(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setRejectTarget(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: 14, padding: 20, width: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Motivo del rechazo</div>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
              Pedido de {rejectTarget.customerName}
            </div>
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="caja-input"
              style={{ marginBottom: 8 }}
            >
              {REJECT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {rejectReason === "Otro" && (
              <input
                value={rejectOther}
                onChange={(e) => setRejectOther(e.target.value)}
                placeholder="Detalle el motivo"
                className="caja-input"
                style={{ marginBottom: 8 }}
              />
            )}
            <button
              type="button"
              className="btn btn-danger"
              style={{ width: "100%", marginTop: 6 }}
              onClick={confirmReject}
            >
              Rechazar pedido
            </button>
            <button
              type="button"
              className="btn"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => setRejectTarget(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
