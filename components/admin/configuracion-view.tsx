"use client";

import { useEffect, useState } from "react";
import { Lock, Printer, Truck, UserCog } from "lucide-react";
import type { AfipConfig, BusinessConfig } from "@/lib/admin/types";
import type { Section } from "@/lib/admin/client-types";
import { MenuSpecialCard } from "@/components/admin/menu-special-card";

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

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Alias para transferencias
            <input
              defaultValue={business.transferAlias}
              onBlur={(e) => saveBusiness({ transferAlias: e.target.value })}
              placeholder="Ej: madero.resto"
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
            <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
              Lo ve el cliente en el menú online cuando elige pagar por transferencia. Si se deja vacío, la
              opción de transferencia no aparece.
            </span>
          </label>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Titular de la cuenta (opcional)
            <input
              defaultValue={business.transferHolder}
              onBlur={(e) => saveBusiness({ transferHolder: e.target.value })}
              placeholder="Ej: Hernán Fontana"
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
            <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
              Se muestra junto al alias para que el cliente confirme que transfiere a la cuenta correcta.
            </span>
          </label>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Logo (URL)
            <input
              defaultValue={business.logoUrl}
              onBlur={(e) => saveBusiness({ logoUrl: e.target.value })}
              placeholder="Ej: https://tusitio.com/logo.png"
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
            <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
              Se usa centrado arriba del ticket final que se le da al cliente al cobrar.
            </span>
            {business.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logoUrl}
                alt="Vista previa del logo"
                style={{ marginTop: 8, maxHeight: 60, maxWidth: 180, display: "block" }}
              />
            )}
          </label>

          <div style={{ fontSize: 11.5, color: "var(--text-faint)", minHeight: 14 }}>
            {businessSaving ? "Guardando…" : businessSaved ? "Guardado ✓" : ""}
          </div>
        </div>
      </div>

      <MenuSpecialCard />

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
            Cada persona entra con su propio PIN (ver <strong>Usuarios</strong>). El PIN nunca se guarda en
            texto plano: se hashea antes de guardarse y nunca se usa como token de sesión. Cada inicio y
            cierre de sesión queda registrado, y cada acción sensible (precios, caja, configuración) se
            valida en el servidor según el rol de quien la hace, no solo escondiendo botones en la
            pantalla.
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
          <button
            type="button"
            className="btn"
            style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "10px 16px" }}
            onClick={() => onGoTo("usuarios")}
          >
            <UserCog size={15} />
            Usuarios y roles
          </button>
        </div>
      </div>
    </div>
  );
}
