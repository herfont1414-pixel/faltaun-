"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/admin/format";
import type { Expense, ExpensePaymentMethod } from "@/lib/admin/types";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function ExpensesView() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("efectivo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/expenses")
      .then((res) => res.json())
      .then((data: { expenses: Expense[] }) => setExpenses(data.expenses ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    setError(null);
    const value = Number(amount);
    if (!concept.trim()) {
      setError("Ingresá un concepto (ej: Pago a proveedor)");
      return;
    }
    if (!value || value <= 0) {
      setError("Ingresá un monto válido");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concept: concept.trim(), amount: value, paymentMethod }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Error inesperado");
      return;
    }
    setConcept("");
    setAmount("");
    setPaymentMethod("efectivo");
    load();
  }

  const todayTotal = (expenses ?? [])
    .filter((e) => new Date(e.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, e) => sum + e.amount, 0);

  if (expenses === null) {
    return <div className="mostrador">Cargando gastos…</div>;
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 14 }}>Gastos</h1>

      <div className="m-section">
        <div className="caja-stats" style={{ marginBottom: 18 }}>
          <div className="caja-stat highlight">
            <div className="cs-label">Gastado hoy</div>
            <div className="cs-value">{money(todayTotal)}</div>
          </div>
        </div>

        <div className="m-section-title">Registrar salida de dinero</div>
        <div className="caja-card">
          <div className="caja-field">
            <label>Concepto</label>
            <input
              type="text"
              placeholder="Ej: Pago a proveedor, compra de hielo..."
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="caja-input"
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="caja-field" style={{ flex: 1 }}>
              <label>Monto</label>
              <input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="caja-input"
              />
            </div>
          </div>
          <div className="footer-actions" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className={`btn ${paymentMethod === "efectivo" ? "btn-primary" : ""}`}
              onClick={() => setPaymentMethod("efectivo")}
            >
              Efectivo
            </button>
            <button
              type="button"
              className={`btn ${paymentMethod === "transferencia" ? "btn-primary" : ""}`}
              onClick={() => setPaymentMethod("transferencia")}
            >
              Transferencia
            </button>
          </div>
          {error && <div className="caja-error">{error}</div>}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            Registrar gasto
          </button>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-title">Últimos gastos</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th>Medio</th>
              <th style={{ textAlign: "right" }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={4} className="m-empty">
                  Todavía no se registró ningún gasto.
                </td>
              </tr>
            ) : (
              expenses.map((e) => (
                <tr key={e.id}>
                  <td>{fmtTime(e.createdAt)}</td>
                  <td>{e.concept}</td>
                  <td>{e.paymentMethod === "efectivo" ? "Efectivo" : "Transferencia"}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{money(e.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
