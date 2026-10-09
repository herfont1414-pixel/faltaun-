"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/admin/format";
import { CHANNEL_LABEL, DELIVERY_STATUS_LABEL } from "@/lib/admin/order-labels";
import type { DeliveryZone, Order } from "@/lib/admin/types";

// Lo que se pide antes de cargar los productos de un pedido nuevo.
export interface NewOrderInput {
  channel: "mostrador" | "whatsapp";
  delivery: boolean;
  name: string;
  zone: string | null;
  address: string;
}

interface MostradorViewProps {
  openOrders: Order[];
  closedOrders: Order[];
  onNewOrder: (input: NewOrderInput) => void;
  onOpenOrder: (orderId: string) => void;
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

// Botones chicos para elegir entre pocas opciones (pestañitas).
function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`btn ${value === o.value ? "btn-primary" : ""}`}
          style={{ flex: "none", padding: "6px 14px", fontSize: 12.5 }}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MostradorView({
  openOrders,
  closedOrders,
  onNewOrder,
  onOpenOrder,
  title = "Mostrador",
  newLabel = "+ Nuevo pedido",
  simple = false,
}: MostradorViewProps) {
  const enCurso = openOrders.filter((order) => order.items.length > 0 || order.isDelivery || order.channel === "web");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"mostrador" | "whatsapp">("mostrador");
  const [delivery, setDelivery] = useState(false);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [zoneName, setZoneName] = useState("");
  const [address, setAddress] = useState("");
  const [formError, setFormError] = useState("");
  const cols = simple ? 4 : 6;

  // Las zonas (y su precio de envío) se piden recién cuando se abre el formulario.
  useEffect(() => {
    if (!showForm || simple) return;
    fetch("/api/admin/delivery-zones")
      .then((res) => res.json())
      .then((data: { zones?: DeliveryZone[] }) => setZones(data.zones ?? []))
      .catch(() => setZones([]));
  }, [showForm, simple]);

  function resetForm() {
    setShowForm(false);
    setName("");
    setChannel("mostrador");
    setDelivery(false);
    setZoneName("");
    setAddress("");
    setFormError("");
  }

  function createOrder() {
    if (delivery && zones.length > 0 && !zoneName) {
      setFormError("Elegí la zona para calcular el envío.");
      return;
    }
    onNewOrder({ channel, delivery, name: name.trim(), zone: delivery ? zoneName || null : null, address: address.trim() });
    resetForm();
  }

  return (
    <div className="mostrador">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <h1>{title}</h1>
        {simple ? (
          <button
            type="button"
            className="m-new-btn"
            onClick={() => onNewOrder({ channel: "mostrador", delivery: false, name: "", zone: null, address: "" })}
          >
            {newLabel}
          </button>
        ) : (
          <button type="button" className="m-new-btn" onClick={() => (showForm ? resetForm() : setShowForm(true))}>
            {showForm ? "Cancelar" : newLabel}
          </button>
        )}
      </div>

      {showForm && !simple && (
        <div className="m-section">
          <div className="caja-card" style={{ maxWidth: 440 }}>
            <div className="caja-field">
              <label>Nombre de quien pidió (opcional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="caja-input"
                placeholder="Ej: Carmen"
              />
            </div>

            <div className="caja-field">
              <label>Cómo pidió</label>
              <Tabs
                value={channel}
                onChange={setChannel}
                options={[
                  { value: "mostrador", label: "En el local" },
                  { value: "whatsapp", label: "WhatsApp" },
                ]}
              />
            </div>

            <div className="caja-field">
              <label>Entrega</label>
              <Tabs
                value={delivery ? "delivery" : "retira"}
                onChange={(v) => setDelivery(v === "delivery")}
                options={[
                  { value: "retira", label: "Retira" },
                  { value: "delivery", label: "Delivery" },
                ]}
              />
            </div>

            {delivery && (
              <>
                <div className="caja-field">
                  <label>Zona de envío</label>
                  {zones.length > 0 ? (
                    <select
                      value={zoneName}
                      onChange={(e) => {
                        setZoneName(e.target.value);
                        setFormError("");
                      }}
                      className="caja-input"
                    >
                      <option value="">Elegí la zona</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.name}>
                          {z.name} · {money(z.cost)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
                      Todavía no hay zonas cargadas (se cargan en Delivery → Zonas de envío). El envío va sin costo.
                    </p>
                  )}
                </div>
                <div className="caja-field">
                  <label>Dirección (opcional)</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="caja-input"
                    placeholder="Calle y número"
                  />
                </div>
              </>
            )}

            {formError && <p style={{ color: "#b91c1c", fontSize: 12.5, marginBottom: 8 }}>{formError}</p>}
            <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={createOrder}>
              Crear pedido y cargar productos
            </button>
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
