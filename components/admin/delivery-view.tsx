"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/admin/format";
import type { DeliveryZone, Order } from "@/lib/admin/types";

interface DeliveryViewProps {
  openOrders: Order[];
  closedOrders: Order[];
  onNewOrder: (customer: {
    name: string;
    phone: string;
    address: string;
    zone: string | null;
    shippingCost: number;
  }) => void;
  onOpenOrder: (orderId: string) => void;
}

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
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

export function DeliveryView({ openOrders, closedOrders, onNewOrder, onOpenOrder }: DeliveryViewProps) {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneCost, setNewZoneCost] = useState("");

  function loadZones() {
    fetch("/api/admin/delivery-zones")
      .then((res) => res.json())
      .then((data: { zones: DeliveryZone[] }) => setZones(data.zones ?? []));
  }

  useEffect(() => {
    loadZones();
  }, []);

  async function lookupPhone(value: string) {
    setPhone(value);
    setLookupMsg(null);
    if (value.trim().length < 6) return;
    const res = await fetch(`/api/admin/delivery-customer/${encodeURIComponent(value.trim())}`);
    const data = await res.json();
    if (data.customer) {
      setName(data.customer.name);
      setAddress(data.customer.address ?? "");
      setLookupMsg("Cliente encontrado · datos cargados");
    }
  }

  const shippingCost = zones.find((z) => z.name === zoneName)?.cost ?? 0;

  function createOrder() {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setLookupMsg("Completá nombre, teléfono y dirección");
      return;
    }
    onNewOrder({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      zone: zoneName || null,
      shippingCost,
    });
    setPhone("");
    setName("");
    setAddress("");
    setZoneName("");
    setLookupMsg(null);
  }

  async function addZone() {
    if (!newZoneName.trim()) return;
    await fetch("/api/admin/delivery-zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newZoneName.trim(), cost: Number(newZoneCost) || 0 }),
    });
    setNewZoneName("");
    setNewZoneCost("");
    loadZones();
  }

  async function removeZone(id: number) {
    await fetch(`/api/admin/delivery-zones/${id}`, { method: "DELETE" });
    loadZones();
  }

  const enCurso = openOrders.filter((order) => order.items.length > 0 || order.isDelivery);

  return (
    <div className="mostrador">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h1>Delivery</h1>
        <button type="button" className="btn" style={{ flex: "none", padding: "10px 16px" }} onClick={() => setShowZones((v) => !v)}>
          Zonas de envío
        </button>
      </div>

      {showZones && (
        <div className="m-section">
          <div className="m-section-title">Zonas y costo de envío</div>
          <div className="caja-card">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div className="caja-field" style={{ flex: 1 }}>
                <label>Zona</label>
                <input
                  type="text"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  className="caja-input"
                  placeholder="Ej: Centro"
                />
              </div>
              <div className="caja-field" style={{ flex: 1 }}>
                <label>Costo</label>
                <input
                  type="number"
                  value={newZoneCost}
                  onChange={(e) => setNewZoneCost(e.target.value)}
                  className="caja-input"
                  placeholder="0"
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={addZone}>
                Agregar
              </button>
            </div>
          </div>
          {zones.length > 0 && (
            <table className="m-table" style={{ marginTop: 10 }}>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td>{z.name}</td>
                    <td style={{ textAlign: "right" }}>{money(z.cost)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn" onClick={() => removeZone(z.id)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="m-section">
        <div className="m-section-title">Nuevo pedido delivery / take away</div>
        <div className="caja-card">
          <div style={{ display: "flex", gap: 10 }}>
            <div className="caja-field" style={{ flex: 1 }}>
              <label>Teléfono</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => lookupPhone(e.target.value)}
                className="caja-input"
                placeholder="11 2345 6789"
              />
            </div>
            <div className="caja-field" style={{ flex: 1 }}>
              <label>Nombre</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="caja-input"
                placeholder="Nombre del cliente"
              />
            </div>
          </div>
          <div className="caja-field">
            <label>Dirección</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="caja-input"
              placeholder="Calle y número (dejar vacío para take away)"
            />
          </div>
          {zones.length > 0 && (
            <div className="caja-field">
              <label>Zona de envío</label>
              <select value={zoneName} onChange={(e) => setZoneName(e.target.value)} className="caja-input">
                <option value="">Sin envío / take away</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.name}>
                    {z.name} · {money(z.cost)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {lookupMsg && <div className="caja-error">{lookupMsg}</div>}
          <button type="button" className="btn btn-primary" onClick={createOrder}>
            Crear pedido
          </button>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-title">En curso</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Hora inicio</th>
              <th>Estado</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {enCurso.length === 0 ? (
              <tr>
                <td colSpan={4} className="m-empty">
                  Sin pedidos delivery en curso.
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
                  <td>
                    {order.customerName} · {order.customerPhone}
                  </td>
                  <td>{formatTime(order.openedAt)}</td>
                  <td>
                    <span className="pill encurso">
                      {order.deliveryStatus ? DELIVERY_STATUS_LABEL[order.deliveryStatus] : "En curso"}
                    </span>
                  </td>
                  <td className="m-total">{money(order.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="m-section">
        <div className="m-section-title">Cerrados (últimos 5)</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Fecha y hora</th>
              <th>Estado</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {closedOrders.length === 0 ? (
              <tr>
                <td colSpan={4} className="m-empty">
                  Todavía no hay pedidos delivery cerrados.
                </td>
              </tr>
            ) : (
              closedOrders.map((order) => (
                <tr key={order.id} className="m-row-strip cerrada">
                  <td>
                    {order.customerName} · {order.customerPhone}
                  </td>
                  <td>{formatDateTime(order.closedAt ?? order.openedAt)}</td>
                  <td>
                    <span className="pill cerrada">Entregado</span>
                  </td>
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
