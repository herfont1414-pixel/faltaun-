"use client";

import { useEffect, useState } from "react";
import type { PrintConfig } from "@/lib/admin/types";

interface PrintArea {
  id: number;
  nombre: string;
}

const FONT_SIZE_OPTIONS: { value: PrintConfig["fontSizeHeader"]; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "pequena", label: "Pequeña" },
];

export function ImpresionView() {
  const [areas, setAreas] = useState<PrintArea[] | null>(null);
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState<PrintConfig | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  function load() {
    fetch("/api/admin/print-areas")
      .then((res) => res.json())
      .then((data: { areas: PrintArea[] }) => setAreas(data.areas ?? []));
  }

  function loadConfig() {
    fetch("/api/admin/print-config")
      .then((res) => res.json())
      .then((data: { config: PrintConfig }) => setConfig(data.config));
  }

  useEffect(() => {
    load();
    loadConfig();
  }, []);

  async function addArea() {
    if (!nombre.trim()) return;
    setSaving(true);
    await fetch("/api/admin/print-areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombre.trim() }),
    });
    setNombre("");
    setSaving(false);
    load();
  }

  async function removeArea(id: number) {
    await fetch(`/api/admin/print-areas/${id}`, { method: "DELETE" });
    load();
  }

  async function saveConfig(patch: Partial<PrintConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    setConfigSaving(true);
    setConfigSaved(false);
    const res = await fetch("/api/admin/print-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.config) setConfig(data.config);
    setConfigSaving(false);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 1800);
  }

  if (!areas || !config) {
    return <div className="mostrador">Cargando impresión…</div>;
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Impresión</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 20, maxWidth: 520 }}>
        Configurá cómo se imprimen las comandas de cocina y los tickets/precuentas en la impresora
        térmica, y las áreas que separan la comanda cuando se manda a cocina.
      </p>

      <div className="m-section">
        <div className="m-section-title">Configuración de impresión</div>
        <div className="caja-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: "1 1 160px" }}>
              Ancho de papel
              <select
                value={config.paperWidthMm}
                onChange={(e) => saveConfig({ paperWidthMm: Number(e.target.value) === 58 ? 58 : 80 })}
                className="caja-input"
                style={{ marginTop: 6, width: "100%" }}
              >
                <option value={80}>80mm</option>
                <option value={58}>58mm</option>
              </select>
            </label>

            <label style={{ fontSize: 12.5, fontWeight: 600, flex: "1 1 160px" }}>
              Modo ahorro de papel
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className={`btn ${config.paperSavingMode ? "btn-primary" : ""}`}
                  style={{ flex: "none", padding: "8px 14px" }}
                  onClick={() => saveConfig({ paperSavingMode: !config.paperSavingMode })}
                >
                  {config.paperSavingMode ? "Activado" : "Desactivado"}
                </button>
              </div>
            </label>
          </div>

          <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: 0 }}>
            Con el modo ahorro activado, los ítems repetidos se agrupan en una sola línea
            multiplicando la cantidad, en vez de listarse por separado.
          </p>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Texto de encabezado
            <input
              defaultValue={config.headerText}
              onBlur={(e) => saveConfig({ headerText: e.target.value })}
              placeholder="Ej: Madero Restó"
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
          </label>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Texto de pie de página
            <input
              defaultValue={config.footerText}
              onBlur={(e) => saveConfig({ footerText: e.target.value })}
              placeholder="Ej: ¡Gracias por tu visita!"
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
          </label>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: "1 1 140px" }}>
              Letra · Encabezado
              <select
                value={config.fontSizeHeader}
                onChange={(e) => saveConfig({ fontSizeHeader: e.target.value as PrintConfig["fontSizeHeader"] })}
                className="caja-input"
                style={{ marginTop: 6, width: "100%" }}
              >
                {FONT_SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: "1 1 140px" }}>
              Letra · Cuerpo
              <select
                value={config.fontSizeBody}
                onChange={(e) => saveConfig({ fontSizeBody: e.target.value as PrintConfig["fontSizeHeader"] })}
                className="caja-input"
                style={{ marginTop: 6, width: "100%" }}
              >
                {FONT_SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12.5, fontWeight: 600, flex: "1 1 140px" }}>
              Letra · Pie
              <select
                value={config.fontSizeFooter}
                onChange={(e) => saveConfig({ fontSizeFooter: e.target.value as PrintConfig["fontSizeHeader"] })}
                className="caja-input"
                style={{ marginTop: 6, width: "100%" }}
              >
                {FONT_SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ fontSize: 11.5, color: "var(--text-faint)", minHeight: 14 }}>
            {configSaving ? "Guardando…" : configSaved ? "Guardado ✓" : ""}
          </div>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-title">Impresión directa (ESC/POS)</div>
        <div className="caja-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0, maxWidth: 520 }}>
            Imprime directo en la impresora térmica conectada a esta PC, sin ningún diálogo de impresión.
            Solo funciona en modo local (<code>start-local.bat</code>) y en Windows — contra el sitio online
            (Vercel) no hay forma de llegar a una impresora USB física, así que ahí siempre se usa el flujo
            normal del navegador.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className={`btn ${config.directPrintEnabled ? "btn-primary" : ""}`}
              style={{ flex: "none", padding: "8px 14px" }}
              onClick={() => saveConfig({ directPrintEnabled: !config.directPrintEnabled })}
            >
              {config.directPrintEnabled ? "Activada" : "Desactivada"}
            </button>
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            Nombre de la impresora en Windows
            <input
              defaultValue={config.printerName}
              onBlur={(e) => saveConfig({ printerName: e.target.value })}
              placeholder='Ej: POS-58-Series'
              className="caja-input"
              style={{ marginTop: 6, width: "100%" }}
            />
            <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
              Tiene que ser exactamente el nombre que aparece en Windows → Dispositivos e impresoras. No
              hace falta compartirla ni cambiarle el driver.
            </span>
          </label>

          <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0 }}>
            Si está desactivada, o si el navegador no le habla a la instancia local de esta PC, "Enviar a
            cocina" e "Imprimir" siguen funcionando igual que siempre (se abre el diálogo de impresión del
            navegador).
          </p>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-title">Áreas de impresión (comanda de cocina)</div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14, maxWidth: 480 }}>
          Las comandas que se mandan a cocina (botón "Enviar a cocina") se separan en estas áreas según el
          área asignada a cada producto en <strong>Productos</strong>. Un producto sin área asignada cae en
          Cocina (o Barra si es de la categoría Bebidas), para no perder nada mientras se termina de
          clasificar la carta.
        </p>

        <div className="caja-card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Parrilla, Postres..."
              className="caja-input"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-primary" disabled={saving} onClick={addArea}>
              Agregar
            </button>
          </div>
        </div>

        <table className="m-table">
          <tbody>
            {areas.length === 0 ? (
              <tr>
                <td className="m-empty">Sin áreas todavía.</td>
              </tr>
            ) : (
              areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.nombre}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="btn" onClick={() => removeArea(a.id)}>
                      Quitar
                    </button>
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
