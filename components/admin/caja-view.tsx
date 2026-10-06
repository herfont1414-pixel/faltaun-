"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/admin/format";
import type { Shift } from "@/lib/admin/types";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function CajaView() {
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [history, setHistory] = useState<Shift[]>([]);
  const [openingCash, setOpeningCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/shift")
      .then((res) => res.json())
      .then((data: { shift: Shift | null; history: Shift[] }) => {
        setShift(data.shift);
        setHistory(data.history ?? []);
      });
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleOpen() {
    setError(null);
    const value = Number(openingCash || "0");
    if (Number.isNaN(value) || value < 0) {
      setError("Ingresá un monto inicial válido");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/shift/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingCash: value }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Error inesperado");
      return;
    }
    setOpeningCash("");
    setShift(data.shift);
    load();
  }

  async function handleClose() {
    setError(null);
    const value = Number(countedCash || "0");
    if (Number.isNaN(value) || value < 0) {
      setError("Ingresá el monto contado en caja");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/shift/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countedCash: value, notes }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Error inesperado");
      return;
    }
    setShowClose(false);
    setCountedCash("");
    setNotes("");
    load();
  }

  if (shift === undefined) {
    return <div className="mostrador">Cargando caja…</div>;
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 14 }}>Caja</h1>

      {!shift && !showClose && (
        <div className="m-section">
          <div className="m-section-title">Abrir turno</div>
          <div className="caja-card">
            <div className="caja-field">
              <label>Monto inicial en caja</label>
              <input
                type="number"
                placeholder="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="caja-input"
              />
            </div>
            {error && <div className="caja-error">{error}</div>}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleOpen}>
              Abrir turno
            </button>
          </div>
        </div>
      )}

      {shift && (
        <div className="m-section">
          <div className="m-section-title">Turno abierto · desde {fmtTime(shift.openedAt)}</div>
          <div className="caja-stats">
            <div className="caja-stat">
              <div className="cs-label">Monto inicial</div>
              <div className="cs-value">{money(shift.openingCash)}</div>
            </div>
            <div className="caja-stat">
              <div className="cs-label">Ventas efectivo</div>
              <div className="cs-value">{money(shift.salesEfectivo)}</div>
            </div>
            <div className="caja-stat">
              <div className="cs-label">Ventas transferencia</div>
              <div className="cs-value">{money(shift.salesTransferencia)}</div>
            </div>
            <div className="caja-stat">
              <div className="cs-label">Ventas cta. cte.</div>
              <div className="cs-value">{money(shift.salesCuentaCorriente)}</div>
            </div>
            <div className="caja-stat highlight">
              <div className="cs-label">Esperado en caja</div>
              <div className="cs-value">{money(shift.expectedCash ?? 0)}</div>
            </div>
          </div>

          {!showClose ? (
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 14, flex: "none", padding: "10px 18px" }}
              onClick={() => setShowClose(true)}
            >
              Cerrar turno
            </button>
          ) : (
            <div className="caja-card" style={{ marginTop: 14 }}>
              <div className="caja-field">
                <label>Monto contado en caja (efectivo real)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  className="caja-input"
                />
              </div>
              {countedCash && !Number.isNaN(Number(countedCash)) && (
                <div className="caja-diff-preview">
                  Diferencia: {money(Number(countedCash) - (shift.expectedCash ?? 0))}
                </div>
              )}
              <div className="caja-field">
                <label>Notas (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: faltante por vuelto..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="caja-input"
                />
              </div>
              {error && <div className="caja-error">{error}</div>}
              <div className="footer-actions">
                <button type="button" className="btn" onClick={() => setShowClose(false)} disabled={busy}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={handleClose}>
                  Confirmar cierre
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="m-section">
        <div className="m-section-title">Turnos recientes</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>Cierre</th>
              <th>Inicial</th>
              <th>Esperado</th>
              <th>Contado</th>
              <th style={{ textAlign: "right" }}>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={5} className="m-empty">
                  Todavía no se cerró ningún turno.
                </td>
              </tr>
            ) : (
              history.map((h) => (
                <tr key={h.id}>
                  <td>{h.closedAt ? fmtTime(h.closedAt) : "–"}</td>
                  <td>{money(h.openingCash)}</td>
                  <td>{money(h.expectedCash ?? 0)}</td>
                  <td>{money(h.countedCash ?? 0)}</td>
                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      color: (h.difference ?? 0) < 0 ? "var(--red)" : "var(--green-dark)",
                    }}
                  >
                    {money(h.difference ?? 0)}
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
