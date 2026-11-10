"use client";

import { useEffect, useState } from "react";
import { CustomerNameInput, customerSummary } from "@/components/admin/customer-name-input";
import { money } from "@/lib/admin/format";
import type { DeliveryZone } from "@/lib/admin/types";

interface DeliveryConvertModalProps {
  busy: boolean;
  initial: { name: string | null; phone: string | null };
  onCancel: () => void;
  onConfirm: (data: { name: string; phone: string; address: string; zone: string | null }) => void;
}

// Datos del envío para pasar un pedido de mostrador a delivery: los productos no se tocan.
export function DeliveryConvertModal({ busy, initial, onCancel, onConfirm }: DeliveryConvertModalProps) {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [name, setName] = useState(initial.name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/delivery-zones")
      .then((res) => res.json())
      .then((data: { zones: DeliveryZone[] }) => setZones(data.zones ?? []))
      .catch(() => {});
  }, []);

  // Si el teléfono ya está en la agenda de delivery, trae nombre y dirección.
  async function lookupPhone(value: string) {
    setPhone(value);
    if (value.trim().length < 6) return;
    try {
      const res = await fetch(`/api/admin/delivery-customer/${encodeURIComponent(value.trim())}`);
      const data = await res.json();
      if (data.customer) {
        setName((n) => n || data.customer.name);
        setAddress((a) => a || (data.customer.address ?? ""));
        setMsg("Cliente encontrado · datos cargados");
      }
    } catch {
      // sin agenda: se completa a mano
    }
  }

  const cost = zones.find((z) => z.name === zone)?.cost ?? 0;
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 13,
    marginTop: 5,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-dim)" };

  function confirm() {
    if (!name.trim() || !address.trim()) {
      setMsg("Completá nombre y dirección");
      return;
    }
    onConfirm({ name: name.trim(), phone: phone.trim(), address: address.trim(), zone: zone || null });
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onCancel}
    >
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, width: 360, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 2 }}>Pasar a delivery</div>
        <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 16 }}>
          El pedido conserva sus productos y lo ya enviado a cocina; se suma el envío y pasa a la pantalla Delivery.
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Teléfono</label>
          <input value={phone} onChange={(e) => lookupPhone(e.target.value)} placeholder="WhatsApp del cliente" inputMode="tel" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Cliente</label>
          <CustomerNameInput
            value={name}
            onChange={setName}
            onPick={(c) => {
              setName(c.name);
              if (c.phone) setPhone(c.phone);
              if (c.address) setAddress(c.address);
              setMsg(`Cliente cargado · ${customerSummary(c)}`);
            }}
            placeholder="Escribí y elegí el cliente"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Dirección</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, referencias" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Zona de envío</label>
          <select value={zone} onChange={(e) => setZone(e.target.value)} style={inputStyle}>
            <option value="">Sin zona (envío $0, se puede ajustar en el pedido)</option>
            {zones.map((z) => (
              <option key={z.name} value={z.name}>
                {z.name} · {money(z.cost)}
              </option>
            ))}
          </select>
          {zone && <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-dim)" }}>Se suma {money(cost)} de envío.</div>}
        </div>
        {msg && <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>{msg}</div>}

        <div className="footer-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>
            Pasar a delivery
          </button>
        </div>
      </div>
    </div>
  );
}
