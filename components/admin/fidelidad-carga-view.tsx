"use client";

import { useState } from "react";
import type { StampImportResult } from "@/lib/admin/loyalty-import";

const STATUS_LABEL: Record<StampImportResult["status"], string> = {
  nuevo: "Cuenta nueva",
  actualizado: "Se actualiza",
  sin_cambios: "Sin cambios (ya tiene esos sellos o más)",
};

// Carga de sellos que los clientes ya tenían (solo administrador). Primero muestra qué
// va a pasar, y recién con "Confirmar" guarda. No genera premios por sellos anteriores.
export function FidelidadCargaView() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<StampImportResult[] | null>(null);
  const [saved, setSaved] = useState<StampImportResult[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(confirm: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/loyalty/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo completar la operación");
      if (confirm) {
        setSaved(data.results);
        setPreview(null);
        setText("");
      } else {
        setPreview(data.results);
        setSaved(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = saved ?? preview;
  const changes = preview?.filter((r) => r.status !== "sin_cambios").length ?? 0;

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Fidelidad · Cargar sellos</h1>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-faint)" }}>
        Para pasar los sellos que los clientes ya tenían. Una línea por cliente: <b>Nombre; Teléfono; Sellos; Gastado</b> (el gastado es opcional).
        Deja a cada cliente con esa cantidad de sellos: si ya tiene esos o más, no se toca. No entrega premios por sellos anteriores.
        Primero se revisa y después se confirma.
      </p>

      {saved && (
        <div style={{ background: "#e8f6ec", border: "1px solid #7bc58f", color: "#1d5a31", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
          Listo: se guardaron {saved.filter((r) => r.status !== "sin_cambios").length} clientes.
        </div>
      )}
      {error && (
        <div style={{ background: "#fdecec", border: "1px solid #e5a0a0", color: "#8a1f1f", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13, whiteSpace: "pre-line" }}>
          {error}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        placeholder={"Juan Pérez; 3755000000; 3; 25000\nAna Gómez; 3755111111; 1"}
        className="caja-input"
        rows={10}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
      />
      <div style={{ display: "flex", gap: 8, margin: "10px 0 18px" }}>
        <button type="button" className="btn" style={{ flex: "none" }} disabled={busy || !text.trim()} onClick={() => send(false)}>
          Revisar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: "none" }}
          disabled={busy || !preview || changes === 0}
          onClick={() => send(true)}
        >
          Confirmar y guardar{preview ? ` (${changes})` : ""}
        </button>
      </div>

      {rows && rows.length > 0 && (
        <div className="m-section">
          <div className="m-section-title">{saved ? "Guardado" : "Vista previa (todavía no se guardó nada)"}</div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
                <th style={{ padding: "6px 4px" }}>Cliente</th>
                <th style={{ padding: "6px 4px" }}>Teléfono</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>Sellos</th>
                <th style={{ padding: "6px 4px" }}>Qué pasa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.phone} style={{ borderTop: "1px solid var(--border, #e5e5e5)" }}>
                  <td style={{ padding: "6px 4px" }}>{r.name ?? "—"}</td>
                  <td style={{ padding: "6px 4px" }}>{r.phone}</td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>{r.before === r.after ? r.after : `${r.before} → ${r.after}`}</td>
                  <td style={{ padding: "6px 4px" }}>{STATUS_LABEL[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
