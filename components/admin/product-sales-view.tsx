"use client";

import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/admin/format";
import { businessDayKey } from "@/lib/admin/business-day";
import type { ProductSalesReport } from "@/lib/admin/product-sales";

type Preset = "7" | "30" | "mes" | "mes_pasado" | "todo";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
  { value: "mes_pasado", label: "Mes pasado" },
  { value: "todo", label: "Todo (desde agosto)" },
];

const HISTORY_START = "2026-08-01";

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function rangeFor(preset: Preset): { from: string; to: string } {
  const today = businessDayKey();
  if (preset === "7") return { from: addDays(today, -6), to: today };
  if (preset === "30") return { from: addDays(today, -29), to: today };
  if (preset === "mes") return { from: `${today.slice(0, 8)}01`, to: today };
  if (preset === "mes_pasado") {
    const firstThis = `${today.slice(0, 8)}01`;
    const lastPrev = addDays(firstThis, -1);
    return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
  }
  return { from: HISTORY_START, to: today };
}

const fmtDay = (day: string) => {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function ProductSalesView() {
  const [preset, setPreset] = useState<Preset | null>("30");
  const initial = rangeFor("30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<ProductSalesReport | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"revenue" | "qty">("revenue");

  function load(f: string, t: string) {
    setReport(undefined);
    setError("");
    fetch(`/api/admin/product-sales?from=${f}&to=${t}`)
      .then((res) => res.json())
      .then((data: { report?: ProductSalesReport | null; error?: string }) => {
        if (data.error) setError(data.error);
        setReport(data.report ?? null);
      })
      .catch(() => {
        setError("No se pudo cargar el reporte.");
        setReport(null);
      });
  }

  useEffect(() => {
    if (!preset) return;
    const r = rangeFor(preset);
    setFrom(r.from);
    setTo(r.to);
    load(r.from, r.to);
  }, [preset]);

  const rows = useMemo(() => {
    if (!report) return [];
    const q = normalize(query.trim());
    return report.rows
      .filter((r) => (!category || r.category === category) && (!q || normalize(r.name).includes(q)))
      .sort((a, b) => (sortBy === "qty" ? b.qty - a.qty || b.revenue - a.revenue : b.revenue - a.revenue || b.qty - a.qty));
  }, [report, query, category, sortBy]);

  const usesHistory = report?.historyUntil ? report.from <= report.historyUntil : false;
  const usesSystem = report?.historyUntil ? report.to > report.historyUntil : true;

  return (
    <div>
      <div className="footer-actions" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`btn ${preset === p.value ? "btn-primary" : ""}`}
            style={{ flex: "none" }}
            onClick={() => setPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        <div className="caja-field" style={{ margin: 0 }}>
          <label>Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="caja-input" />
        </div>
        <div className="caja-field" style={{ margin: 0 }}>
          <label>Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="caja-input" />
        </div>
        <button
          type="button"
          className="btn"
          style={{ flex: "none", padding: "9px 16px" }}
          onClick={() => {
            setPreset(null);
            if (from && to) load(from, to);
          }}
        >
          Aplicar
        </button>
      </div>

      {report === undefined && <div className="m-empty">Cargando…</div>}
      {error && <div className="m-empty">{error}</div>}

      {report && (
        <>
          <p className="prod-hint" style={{ margin: "0 0 12px" }}>
            {fmtDay(report.from)} al {fmtDay(report.to)} ·{" "}
            {usesHistory && usesSystem && `hasta el ${fmtDay(report.historyUntil!)} son datos de Fudo; desde el día siguiente, de MaderoSys.`}
            {usesHistory && !usesSystem && "datos de Fudo."}
            {!usesHistory && "datos de MaderoSys."}
          </p>

          <div className="report-stats" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <div className="m-section" style={{ flex: "1 1 160px", margin: 0 }}>
              <div className="m-section-title">Ingresos por productos</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{money(report.totalRevenue)}</div>
            </div>
            <div className="m-section" style={{ flex: "1 1 160px", margin: 0 }}>
              <div className="m-section-title">Unidades vendidas</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{report.totalQty.toLocaleString("es-AR")}</div>
            </div>
            <div className="m-section" style={{ flex: "1 1 160px", margin: 0 }}>
              <div className="m-section-title">Productos distintos</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{report.rows.length}</div>
            </div>
          </div>

          {report.byCategory.length > 0 && (
            <div className="prod-tabs" aria-label="Categorías">
              <button type="button" className={`prod-tab ${category === null ? "active" : ""}`} onClick={() => setCategory(null)}>
                Todas
              </button>
              {report.byCategory.map((c) => (
                <button
                  key={c.category}
                  type="button"
                  className={`prod-tab ${category === c.category ? "active" : ""}`}
                  onClick={() => setCategory(category === c.category ? null : c.category)}
                  title={`${money(c.revenue)} · ${c.qty.toLocaleString("es-AR")} u.`}
                >
                  {c.category}
                  <span className="prod-tab-count">{c.share}%</span>
                </button>
              ))}
            </div>
          )}

          <div className="prod-toolbar">
            <input
              type="search"
              className="prod-search"
              placeholder="Buscar producto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="prod-filters">
              <button type="button" className={`prod-filter ${sortBy === "revenue" ? "active" : ""}`} onClick={() => setSortBy("revenue")}>
                Ordenar por ingresos
              </button>
              <button type="button" className={`prod-filter ${sortBy === "qty" ? "active" : ""}`} onClick={() => setSortBy("qty")}>
                Ordenar por cantidad
              </button>
            </div>
          </div>

          <div className="m-section">
            <table className="m-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: "right" }}>Cantidad</th>
                  <th style={{ textAlign: "right" }}>Ingresos</th>
                  <th style={{ textAlign: "right" }}>% ingresos</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="m-empty">
                      Sin ventas para mostrar.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={r.name}>
                      <td style={{ color: "var(--text-faint)" }}>{i + 1}</td>
                      <td>{r.name}</td>
                      <td style={{ color: "var(--text-dim)" }}>{r.category}</td>
                      <td style={{ textAlign: "right" }}>{r.qty.toLocaleString("es-AR")}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{money(r.revenue)}</td>
                      <td style={{ textAlign: "right" }}>{r.share}%</td>
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
