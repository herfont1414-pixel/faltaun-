"use client";

import { useEffect, useState } from "react";
import { Lock, Printer, Truck } from "lucide-react";
import type { AfipConfig, BusinessConfig } from "@/lib/admin/types";
import type { Section } from "@/lib/admin/client-types";

interface ConfiguracionViewProps {
  onGoTo: (section: Section) => void;
}

const CONDICION_IVA_OPTIONS = [
  "Responsable Inscripto",
  "Monotributo",
  "Exento",
  "Consumidor Final",
];

export function ConfiguracionView({ onGoTo }: ConfiguracionViewProps) {
  const [business, setBusiness] = useState<BusinessConfig | null>(null);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessSaved, setBusinessSaved] = useState(false);

  const [afip, setAfip] = useState<AfipConfig | null>(null);
  const [afipSaving, setAfipSaving] = useState(false);
  const [afipSaved, setAfipSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/business-config")
      .then((res) => res.json())
      .then((data: { config: BusinessConfig }) => setBusiness(data.config));
    fetch("/api/admin/afip-config")
      .then((res) => res.json())
      .then((data: { config: AfipConfig }) => setAfip(data.config));
  }, []);

  async function saveBusiness(patch: Partial<BusinessConfig>) {
    if (!business) return;
    const next = { ...business, ...patch };
    setBusiness(next);
    setBusinessSaving(true);
    setBusinessSaved(false);
    const res = await fetch("/api/admin/business-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.config) setBusiness(data.config);
    setBusinessSaving(false);
    setBusinessSaved(true);
    setTimeout(() => setBusinessSaved(false), 1800);
  }

  async function saveAfip(patch: Partial<AfipConfig>) {
    if (!afip) return;
    const next = { ...afip, ...patch };
    setAfip(next);
    setAfipSaving(true);
    setAfipSaved(false);
    const res = await fetch("/api/admin/afip-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.config) setAfip(data.config);
    setAfipSaving(false);
    setAfipSaved(true);
    setTimeout(() => setAfipSaved(false), 1800);
  }

  if (!business || !afip) {
    return <div className="mostrador">Cargando configuración…</div>;
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Configuración</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 20, maxWidth: 520 }}>
        Datos del local, facturación y accesos directos a otras pantallas de configuración.
      </p>

      <div className="m-section">
        <div className="m-section-title">Datos del local</div>
        <div className="caja-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Nombre del local
            <input
              defaultValue={business.name}
              onBlur={(e) => saveBusiness({ name: e.target.value })}
              placeholder="Ej: Madero Restó"
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
          </label>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Dirección
            <input
              defaultValue={business.address}
              onBlur={(e) => saveBusiness({ address: e.target.value })}
              placeholder="Ej: Av. Siempre Viva 742"
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
          </label>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Horarios
            <input
              defaultValue={business.hours}
              onBlur={(e) => saveBusiness({ hours: e.target.value })}
              placeholder="Ej: Mar a Dom 19 a 00hs"
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
          </label>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            WhatsApp del local
            <input
              defaultValue={business.whatsappNumber}
              onBlur={(e) => saveBusiness({ whatsappNumber: e.target.value })}
              placeholder="Ej: 5493511234567 (con código de país, sin + ni espacios)"
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
            <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
              Es el número al que llegan los pedidos y consultas del menú online. Si se deja vacío, se usa
              el número configurado en el servidor.
            </span>
          </label>

          <div style={{ fontSize: 11.5, color: "var(--text-faint)", minHeight: 14 }}>
            {businessSaving ? "Guardando…" : businessSaved ? "Guardado ✓" : ""}
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-title">Facturación (AFIP)</div>
        <div className="caja-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className={`btn ${afip.habilitado ? "btn-primary" : ""}`}
              style={{ flex: "none", padding: "8px 14px" }}
              onClick={() => saveAfip({ habilitado: !afip.habilitado })}
            >
              {afip.habilitado ? "Facturación habilitada" : "Facturación deshabilitada"}
            </button>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
              Datos listos para cuando se conecte la emisión de comprobantes.
            </span>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: "1 1 200px" }}>
              CUIT
              <input
                defaultValue={afip.cuit}
                onBlur={(e) => saveAfip({ cuit: e.target.value })}
                placeholder="Ej: 20345678901"
                className="caja-input"
                style={{ marginTop: 6, width: "100%" }}
              />
            </label>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: "1 1 140px" }}>
              Punto de venta
              <input
                type="number"
                defaultValue={afip.puntoVenta ?? ""}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  saveAfip({ puntoVenta: raw === "" ? null : Number(raw) });
                }}
                placeholder="Ej: 1"
                className="caja-input"
                style={{ marginTop: 6, width: "100%" }}
              />
            </label>
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Condición frente al IVA
            <select
              value={afip.condicionIva}
              onChange={(e) => saveAfip({ condicionIva: e.target.value })}
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            >
              <option value="">Sin definir</option>
              {CONDICION_IVA_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <div style={{ fontSize: 11.5, color: "var(--text-faint)", minHeight: 14 }}>
            {afipSaving ? "Guardando…" : afipSaved ? "Guardado ✓" : ""}
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-title">Seguridad</div>
        <div className="caja-card" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Lock size={18} style={{ flexShrink: 0, marginTop: 2, color: "var(--text-dim)" }} />
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
            El PIN de acceso al panel se define con la variable de entorno <code>ADMIN_PIN</code> en el
            servidor (Vercel u hosting equivalente), no desde acá. Se revisa en cada pedido antes de tocar
            la base de datos, así que cambiarlo requiere actualizar esa variable y volver a desplegar — es
            lo que mantiene segura la parte de pagos y clientes aunque alguien acceda a esta pantalla.
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-title">Accesos directos</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "10px 16px" }}
            onClick={() => onGoTo("impresion")}
          >
            <Printer size={15} />
            Impresión y áreas de cocina
          </button>
          <button
            type="button"
            className="btn"
            style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "10px 16px" }}
            onClick={() => onGoTo("delivery")}
          >
            <Truck size={15} />
            Zonas de delivery
          </button>
        </div>
      </div>
    </div>
  );
}
