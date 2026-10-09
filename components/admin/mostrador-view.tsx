"use client";

import { useState } from "react";
import { money } from "@/lib/admin/format";
import { CHANNEL_LABEL, DELIVERY_STATUS_LABEL } from "@/lib/admin/order-labels";
import type { Order } from "@/lib/admin/types";

interface MostradorViewProps {
  openOrders: Order[];
  closedOrders: Order[];
  onNewOrder: (channel: "mostrador" | "whatsapp", customer?: { name: string; phone: string }) => void;
  onOpenOrder: (orderId: string) => void;
  // Solo en el Mostrador completo: ir a cargar un pedido delivery.
  onGoDelivery?: () => void;
  title?: string;
  newLabel?: string;
  // El Express es solo venta rápida de barra: sin etiquetas de canal ni botones extra.
  simple?: boolean;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Canal (Mostrador / WhatsApp / Web) y, si corresponde, modalidad (Delivery / Retira).
function Chips({ order }: { order: Order }) {
  const channel = order.channel ?? "mostrador";
  return (
    <>
      <span className={`chip ${channel}`}>{CHANNEL_LABEL[channel]}</span>
      {order.isDelivery ? (
        <span className="chip delivery">Delivery</span>
      ) : channel !== "mostrador" ? (
        <span className="chip retiro">Retira</span>
      ) : null}
    </>
  );
}

function Who({ order }: { order: Order }) {
  if (!order.customerName) return <>—</>;
  return (
    <>
      <div>{order.customerName}</div>
      {order.customerPhone && <div className="m-sub">{order.customerPhone}</div>}
    </>
  );
}

export function MostradorView({
  openOrders,
  closedOrders,
  onNewOrder,
  onOpenOrder,
  onGoDelivery,
  title = "Mostrador",
  newLabel = "+ Nuevo pedido",
  simple = false,
}: MostradorViewProps) {
  const enCurso = openOrders.filter((order) => order.items.length > 0 || order.isDelivery || order.channel === "web");
  const [askWhatsapp, setAskWhatsapp] = useState(false);
  const [waName, setWaName] = useState("");
  const [waPhone, setWaPhone] = useState("");
  const cols = simple ? 4 : 6;

  function createWhatsapp() {
    onNewOrder("whatsapp", { name: waName, phone: waPhone });
    setAskWhatsapp(false);
    setWaName("");
    setWaPhone("");
  }

  return (
    <div className="mostrador">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <h1>{title}</h1>
        {simple ? (
          <button type="button" className="m-new-btn" onClick={() => onNewOrder("mostrador")}>
            {newLabel}
          </button>
        ) : (
          <div className="m-actions">
            <button type="button" className="m-new-btn" onClick={() => onNewOrder("mostrador")}>
              + Mostrador
            </button>
            <button type="button" className="m-new-btn" onClick={() => setAskWhatsapp(true)}>
              + WhatsApp
            </button>
            {onGoDelivery && (
              <button type="button" className="m-new-btn" onClick={onGoDelivery}>
                + Delivery
              </button>
            )}
          </div>
        )}
      </div>

      {askWhatsapp && (
        <div className="m-section">
          <div className="caja-card">
            <div className="m-section-title" style={{ marginTop: 0 }}>
              Pedido por WhatsApp (retira en el local)
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="caja-field" style={{ flex: 1 }}>
                <label>Nombre (opcional)</label>
                <input
                  type="text"
                  value={waName}
                  onChange={(e) => setWaName(e.target.value)}
                  className="caja-input"
                  placeholder="Nombre del cliente"
                />
              </div>
              <div className="caja-field" style={{ flex: 1 }}>
                <label>Teléfono (opcional)</label>
                <input
                  type="text"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  className="caja-input"
                  placeholder="3755…"
                />
              </div>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
              Si es para llevar a domicilio, usá &ldquo;+ Delivery&rdquo;.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={createWhatsapp}>
                Crear pedido
              </button>
              <button type="button" className="btn" onClick={() => setAskWhatsapp(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="m-section">
        <div className="m-section-title">En curso</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>{simple ? "Origen" : "Canal"}</th>
              {!simple && <th>Cliente</th>}
              <th className="hide-sm">Hora inicio</th>
              <th>Estado</th>
              {!simple && <th className="hide-sm">Cobro</th>}
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {enCurso.length === 0 ? (
              <tr>
                <td colSpan={cols} className="m-empty">
                  Sin ventas en curso.
                </td>
              </tr>
            ) : (
              enCurso.map((order) => (
                <tr
                  key={order.id}
                  className="m-row-strip encurso"
                  style={{ cursor: "pointer" }}
                  onClick={() => onOpenOrder(order.id)}
                >
                  <td>{simple ? "Mostrador" : <Chips order={order} />}</td>
                  {!simple && (
                    <td>
                      <Who order={order} />
                    </td>
                  )}
                  <td className="hide-sm">{formatTime(order.openedAt)}</td>
                  <td>
                    <span className="pill encurso">
                      {order.isDelivery && order.deliveryStatus
                        ? DELIVERY_STATUS_LABEL[order.deliveryStatus]
                        : "En curso"}
                    </span>
                  </td>
                  {!simple && (
                    <td className="hide-sm" style={{ fontSize: 12.5 }}>
                      {order.paymentHint
                        ? order.paymentHint.method === "transferencia"
                          ? "Transferencia"
                          : "Efectivo"
                        : "—"}
                    </td>
                  )}
                  <td className="m-total">{money(order.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="m-section">
        <div className="m-section-title">Cerradas (últimas 5)</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>{simple ? "Origen" : "Canal"}</th>
              {!simple && <th>Cliente</th>}
              <th className="hide-sm">Fecha y hora</th>
              <th>Estado</th>
              {!simple && <th className="hide-sm">Cobro</th>}
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {closedOrders.length === 0 ? (
              <tr>
                <td colSpan={cols} className="m-empty">
                  Todavía no hay ventas cerradas.
                </td>
              </tr>
            ) : (
              closedOrders.slice(0, 5).map((order) => (
                <tr key={order.id} className="m-row-strip cerrada">
                  <td>{simple ? "Mostrador" : <Chips order={order} />}</td>
                  {!simple && (
                    <td>
                      <Who order={order} />
                    </td>
                  )}
                  <td className="hide-sm">{formatDateTime(order.closedAt ?? order.openedAt)}</td>
                  <td>
                    <span className="pill cerrada">Cerrada</span>
                  </td>
                  {!simple && (
                    <td className="hide-sm" style={{ fontSize: 12.5 }}>
                      {order.paymentMethod === "efectivo"
                        ? "Efectivo"
                        : order.paymentMethod === "transferencia"
                          ? "Transferencia"
                          : order.paymentMethod === "cuenta_corriente"
                            ? "Cta. Cte."
                            : "Mixto"}
                    </td>
                  )}
                  <td className="m-total">{money(order.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
