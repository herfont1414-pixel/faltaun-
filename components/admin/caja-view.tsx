"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/admin/format";
import type { Shift } from "@/lib/admin/types";

type MovementType = "retiro" | "ingreso" | "ajuste";

interface CashMovement {
  id: string;
  type: MovementType;
  amount: number;
  paymentMethod: "efectivo" | "transferencia";
  note: string | null;
  userName: string | null;
  createdAt: string;
}

const MOVEMENT_LABEL: Record<MovementType, string> = {
  retiro: "Retiro",
  ingreso: "Ingreso",
  ajuste: "Ajuste",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function diffBadge(diff: number) {
  if (Math.abs(diff) < 0.5) return <span>{money(diff)}</span>;
  return (
    <span style={{ color: diff < 0 ? "var(--red)" : "var(--green-dark)" }}>
      {diff < 0 ? "🔴" : "🟢"} {money(diff)}
    </span>
  );
}

export function CajaView() {
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [history, setHistory] = useState<Shift[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [openingCash, setOpeningCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [movementType, setMovementType] = useState<MovementType | null>(null);
  const [movementAmount, setMovementAmount] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [movementError, setMovementError] = useState("");

  function load() {
    fetch("/api/admin/shift")
      .then((res) => res.json())
      .then((data: { shift: Shift | null; history: Shift[] }) => {
        setShift(data.shift);
        setHistory(data.history ?? []);
      });
    fetch("/api/admin/cash-movements")
      .then((res) => (res.ok ? res.json() : { movements: [] }))
      .then((data: { movements?: CashMovement[] }) => setMovements(data.movements ?? []));
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

  async function submitMovement() {
    if (!movementType) return;
    setMovementError("");
    const amount = Number(movementAmount);
    if (!amount || Number.isNaN(amount)) {
      setMovementError("Ingresá un monto válido");
      return;
    }
    const res = await fetch("/api/admin/cash-movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: movementType, amount, note: movementNote.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMovementError(data.error ?? "No se pudo registrar");
      return;
    }
    setMovementType(null);
    setMovementAmount("");
    setMovementNote("");
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
            <div className="caja-stat">
              <div className="cs-label">Ingresos</div>
              <div className="cs-value">{money(shift.ingresosEfectivo)}</div>
            </div>
            <div className="caja-stat">
              <div className="cs-label">Gastos (efectivo)</div>
              <div className="cs-value">{money(shift.expensesEfectivo)}</div>
            </div>
            <div className="caja-stat">
              <div className="cs-label">Retiros</div>
              <div className="cs-value">{money(shift.retirosEfectivo)}</div>
            </div>
            <div className="caja-stat">
              <div className="cs-label">Ajustes</div>
              <div className="cs-value">{money(shift.ajustesEfectivo)}</div>
            </div>
            <div className="caja-stat highlight">
              <div className="cs-label">Esperado en caja</div>
              <div className="cs-value">{money(shift.expectedCash ?? 0)}</div>
            </div>
          </div>

          <div className="footer-actions" style={{ marginTop: 14 }}>
            {(["retiro", "ingreso", "ajuste"] as MovementType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`btn ${movementType === t ? "btn-primary" : ""}`}
                onClick={() => setMovementType(movementType === t ? null : t)}
              >
                {MOVEMENT_LABEL[t]}
              </button>
            ))}
            {!showClose && (
              <button type="button" className="btn btn-primary" onClick={() => setShowClose(true)}>
                Cerrar turno
              </button>
            )}
          </div>

          {movementType && (
            <div className="caja-card" style={{ marginTop: 10 }}>
              <div className="caja-field">
                <label>
                  Monto {movementType === "ajuste" ? "(puede ser negativo, para corregir un faltante)" : ""}
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  className="caja-input"
                />
              </div>
              <div className="caja-field">
                <label>Nota (opcional)</label>
                <input
                  type="text"
                  placeholder={
                    movementType === "retiro" ? "Ej: retiro para el dueño" : "Ej: vuelto que faltaba"
                  }
                  value={movementNote}
                  onChange={(e) => setMovementNote(e.target.value)}
                  className="caja-input"
                />
              </div>
              {movementError && <div className="caja-error">{movementError}</div>}
              <div className="footer-actions">
                <button type="button" className="btn" onClick={() => setMovementType(null)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={submitMovement}>
                  Registrar {MOVEMENT_LABEL[movementType].toLowerCase()}
                </button>
              </div>
            </div>
          )}

          {movements.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="m-section-title">Movimientos de este turno</div>
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Tipo</th>
                    <th>Quién</th>
                    <th>Nota</th>
                    <th style={{ textAlign: "right" }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12 }}>{fmtTime(m.createdAt)}</td>
                      <td>{MOVEMENT_LABEL[m.type]}</td>
                      <td>{m.userName ?? "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--text-dim)" }}>{m.note ?? "—"}</td>
                      <td className="m-total">{money(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showClose && (
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
                  Diferencia: {diffBadge(Number(countedCash) - (shift.expectedCash ?? 0))}
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
              <th>Gastos</th>
              <th>Retiros</th>
              <th>Esperado</th>
              <th>Contado</th>
              <th style={{ textAlign: "right" }}>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={7} className="m-empty">
                  Todavía no se cerró ningún turno.
                </td>
              </tr>
            ) : (
              history.map((h) => (
                <tr key={h.id}>
                  <td>{h.closedAt ? fmtTime(h.closedAt) : "–"}</td>
                  <td>{money(h.openingCash)}</td>
                  <td>{money(h.expensesEfectivo)}</td>
                  <td>{money(h.retirosEfectivo)}</td>
                  <td>{money(h.expectedCash ?? 0)}</td>
                  <td>{money(h.countedCash ?? 0)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{diffBadge(h.difference ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
