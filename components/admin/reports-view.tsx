"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/admin/format";
import type { SalesReport } from "@/lib/admin/types";

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cuenta_corriente: "Cta. Cte.",
  sin_definir: "Sin definir",
};

type Preset = "hoy" | "ayer" | "semana" | "mes";

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
function startOfWeek(d: Date) {
  const r = startOfDay(d);
  const day = (r.getDay() + 6) % 7; // lunes = 0
  r.setDate(r.getDate() - day);
  return r;
}
function startOfMonth(d: Date) {
  const r = startOfDay(d);
  r.setDate(1);
  return r;
}

function rangeFor(preset: Preset): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "hoy") return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === "ayer") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (preset === "semana") return { from: startOfWeek(now), to: endOfDay(now) };
  return { from: startOfMonth(now), to: endOfDay(now) };
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
];

export function ReportsView() {
  const [preset, setPreset] = useState<Preset>("hoy");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [report, setReport] = useState<SalesReport | null | undefined>(undefined);

  function load(fromISO: string, toISO: string) {
    setReport(undefined);
    fetch(`/api/admin/reports?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`)
      .then((res) => res.json())
      .then((data: { report: SalesReport | null }) => setReport(data.report));
  }

  useEffect(() => {
    const { from, to } = rangeFor(preset);
    setCustomFrom(toInputDate(from));
    setCustomTo(toInputDate(to));
    load(from.toISOString(), to.toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    const from = startOfDay(new Date(customFrom + "T00:00:00"));
    const to = endOfDay(new Date(customTo + "T00:00:00"));
    load(from.toISOString(), to.toISOString());
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 14 }}>Reportes de ventas</h1>

      <div className="footer-actions" style={{ marginBottom: 10, maxWidth: 520 }}>
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`btn ${preset === p.value ? "btn-primary" : ""}`}
            onClick={() => setPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 22 }}>
        <div className="caja-field" style={{ margin: 0 }}>
          <label>Desde</label>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="caja-input"
          />
        </div>
        <div className="caja-field" style={{ margin: 0 }}>
          <label>Hasta</label>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="caja-input"
          />
        </div>
        <button type="button" className="btn" style={{ flex: "none", padding: "9px 16px" }} onClick={applyCustomRange}>
          Aplicar
        </button>
      </div>

      {report === undefined && <div className="m-empty">Cargando…</div>}

      {report === null && (
        <div className="m-empty">No se pudo cargar el reporte (base no configurada).</div>
      )}

      {report && (
        <>
          <div className="caja-stats" style={{ marginBottom: 26 }}>
            <div className="caja-stat highlight">
              <div className="cs-label">Total vendido</div>
              <div className="cs-value">{money(report.totalSales)}</div>
            </div>
            <div className="caja-stat">
              <div className="cs-label">Pedidos cerrados</div>
              <div className="cs-value">{report.orderCount}</div>
            </div>
            <div className="caja-stat">
              <div className="cs-label">Ticket promedio</div>
              <div className="cs-value">{money(report.avgTicket)}</div>
            </div>
            {report.byPaymentMethod.map((m) => (
              <div className="caja-stat" key={m.method}>
                <div className="cs-label">{PAYMENT_LABELS[m.method] ?? m.method}</div>
                <div className="cs-value">{money(m.total)}</div>
              </div>
            ))}
            <div className="caja-stat">
              <div className="cs-label">Gastos</div>
              <div className="cs-value">{money(report.totalExpenses)}</div>
            </div>
            <div className="caja-stat highlight">
              <div className="cs-label">Neto (ventas - gastos)</div>
              <div className="cs-value">{money(report.netTotal)}</div>
            </div>
          </div>

          <div className="m-section">
            <div className="m-section-title">Productos más vendidos</div>
            <table className="m-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>Cantidad</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {report.topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="m-empty">
                      Sin ventas en este período.
                    </td>
                  </tr>
                ) : (
                  report.topProducts.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td style={{ textAlign: "right" }}>{p.qty}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{money(p.revenue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="m-section">
            <div className="m-section-title">Ventas por categoría</div>
            <table className="m-table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {report.byCategory.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="m-empty">
                      Sin ventas en este período.
                    </td>
                  </tr>
                ) : (
                  report.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{money(c.revenue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="m-section">
            <div className="m-section-title">Detalle de ventas ({report.orders.length})</div>
            <table className="m-table">
              <thead>
                <tr>
                  <th>Cierre</th>
                  <th>Origen</th>
                  <th>Cliente</th>
                  <th>Medio de pago</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {report.orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="m-empty">
                      Sin ventas en este período.
                    </td>
                  </tr>
                ) : (
                  report.orders.map((o) => (
                    <tr key={o.id}>
                      <td>{fmtTime(o.closedAt)}</td>
                      <td>{o.tableNumber ? `Mesa ${o.tableNumber}` : "Mostrador"}</td>
                      <td>{o.customerName ?? "–"}</td>
                      <td>{o.paymentMethod ? PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod : "–"}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{money(o.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
