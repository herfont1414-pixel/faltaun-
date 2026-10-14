"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { money } from "@/lib/admin/format";
import type { SaleKind, SaleRow, SalesDay } from "@/lib/admin/sales-day";

// Control de ventas por jornada (6:00 a 6:00): qué se vendió, en qué mesa o por
// mostrador, quién atendió y cobró, cómo se pagó. Se puede elegir cualquier día.

const PAY_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cuenta_corriente: "Cta. Cte.",
};

// Jornada actual en el navegador: antes de las 6:00 sigue siendo la del día anterior.
function currentJornada() {
  const ar = new Date(Date.now() - 3 * 3600_000 - 6 * 3600_000);
  return ar.toISOString().slice(0, 10);
}
function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayTitle(day: string) {
  const d = new Date(`${day}T12:00:00.000Z`);
  const text = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }) : "—";
function minutesBetween(a: string, b: string | null) {
  const end = b ? new Date(b).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(a).getTime()) / 60000));
}
const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
function payLabel(sale: SaleRow) {
  if (sale.payments.length === 0) return "—";
  if (sale.payments.length === 1) return PAY_LABEL[sale.payments[0].method] ?? sale.payments[0].method;
  return "Combinado";
}
const normalize = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function SalesDayView() {
  const today = currentJornada();
  const [day, setDay] = useState(today);
  const [data, setData] = useState<SalesDay | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<SaleKind | null>(null);
  const [table, setTable] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback((d: string, quiet = false) => {
    if (!quiet) setData(undefined);
    fetch(`/api/admin/sales-day?date=${d}`)
      .then((r) => r.json())
      .then((res: { day?: SalesDay | null; error?: string }) => {
        setError(res.error ?? "");
        setData(res.day ?? null);
      })
      .catch(() => {
        if (!quiet) {
          setError("No se pudieron cargar las ventas.");
          setData(null);
        }
      });
  }, []);

  useEffect(() => {
    load(day);
    setKind(null);
    setTable(null);
    setExpanded(null);
  }, [day, load]);

  // La jornada actual se actualiza sola cada 30 s.
  useEffect(() => {
    if (day !== today) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(day, true);
    }, 30000);
    return () => clearInterval(t);
  }, [day, today, load]);

  const sales = useMemo(() => {
    if (!data) return [];
    const q = normalize(query.trim());
    return data.sales.filter(
      (s) =>
        (!kind || s.kind === kind) &&
        (table === null || s.tableNumber === table) &&
        (!q ||
          normalize(s.label).includes(q) ||
          normalize(s.waiter ?? "").includes(q) ||
          s.items.some((it) => normalize(it.name).includes(q)))
    );
  }, [data, kind, table, query]);
  const shownTotal = sales.reduce((s, x) => s + x.total, 0);
  const openTotal = data?.open.reduce((s, x) => s + x.total, 0) ?? 0;

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 4 }}>Ventas</h1>
      <p className="prod-hint" style={{ margin: "0 0 14px" }}>
        Jornada del <strong>{dayTitle(day)}</strong> · de 6:00 a 6:00 del día siguiente
        {day === today && " · se actualiza sola"}
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" className="btn" style={{ flex: "none", padding: "9px 12px" }} onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior">
          <ChevronLeft size={18} />
        </button>
        <input
          type="date"
          className="caja-input"
          value={day}
          max={today}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          style={{ width: 170 }}
        />
        <button
          type="button"
          className="btn"
          style={{ flex: "none", padding: "9px 12px" }}
          onClick={() => setDay(addDays(day, 1))}
          disabled={day >= today}
          aria-label="Día siguiente"
        >
          <ChevronRight size={18} />
        </button>
        <button type="button" className={`btn ${day === today ? "btn-primary" : ""}`} style={{ flex: "none" }} onClick={() => setDay(today)}>
          Hoy
        </button>
        <button type="button" className="btn" style={{ flex: "none" }} onClick={() => setDay(addDays(today, -1))}>
          Ayer
        </button>
      </div>

      {data === undefined && <div className="m-empty">Cargando…</div>}
      {error && <div className="m-empty">{error}</div>}

      {data && (
        <>
          <div className="sales-kpis">
            <div className="sales-kpi">
              <span>Vendido</span>
              <strong>{money(data.total)}</strong>
            </div>
            <div className="sales-kpi">
              <span>Ventas cobradas</span>
              <strong>{data.count}</strong>
            </div>
            <div className="sales-kpi">
              <span>Ticket promedio</span>
              <strong>{money(Math.round(data.avgTicket))}</strong>
            </div>
            {data.isToday && (
              <div className="sales-kpi">
                <span>En curso ahora</span>
                <strong>
                  {data.open.length} · {money(openTotal)}
                </strong>
              </div>
            )}
          </div>

          <div className="prod-tabs" aria-label="Origen">
            <button type="button" className={`prod-tab ${kind === null ? "active" : ""}`} onClick={() => setKind(null)}>
              Todas <span className="prod-tab-count">{data.count}</span>
            </button>
            {data.byKind.map((k) => (
              <button
                key={k.kind}
                type="button"
                className={`prod-tab ${kind === k.kind ? "active" : ""}`}
                onClick={() => {
                  setKind(kind === k.kind ? null : k.kind);
                  if (k.kind !== "mesa") setTable(null);
                }}
              >
                {k.label}
                <span className="prod-tab-count">
                  {k.count} · {money(k.total)}
                </span>
              </button>
            ))}
          </div>

          <div className="sales-grid">
            <div className="m-section" style={{ margin: 0 }}>
              <div className="m-section-title">Por mesa</div>
              {data.byTable.length === 0 ? (
                <div className="m-empty">Sin ventas en mesas.</div>
              ) : (
                <div className="sales-tables">
                  {data.byTable.map((t) => (
                    <button
                      key={t.tableNumber}
                      type="button"
                      className={`sales-table ${table === t.tableNumber ? "active" : ""}`}
                      onClick={() => {
                        setTable(table === t.tableNumber ? null : t.tableNumber);
                        setKind(null);
                      }}
                      title={t.zone ?? undefined}
                    >
                      <strong>Mesa {t.tableNumber}</strong>
                      <span>{money(t.total)}</span>
                      <small>
                        {t.count} venta{t.count === 1 ? "" : "s"}
                        {t.people > 0 ? ` · ${t.people} pers.` : ""}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="m-section" style={{ margin: 0 }}>
                <div className="m-section-title">Medios de pago</div>
                <table className="m-table">
                  <tbody>
                    {data.byPayment.length === 0 ? (
                      <tr>
                        <td className="m-empty">Sin cobros.</td>
                      </tr>
                    ) : (
                      data.byPayment.map((p) => (
                        <tr key={p.method}>
                          <td>{PAY_LABEL[p.method] ?? p.method}</td>
                          <td style={{ textAlign: "right", color: "var(--text-dim)" }}>{p.count}</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{money(p.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="m-section" style={{ margin: 0 }}>
                <div className="m-section-title">Mesas por mozo</div>
                <table className="m-table">
                  <tbody>
                    {data.byWaiter.length === 0 ? (
                      <tr>
                        <td className="m-empty">Sin ventas en mesas.</td>
                      </tr>
                    ) : (
                      data.byWaiter.map((w) => (
                        <tr key={w.waiter}>
                          <td>{w.waiter}</td>
                          <td style={{ textAlign: "right", color: "var(--text-dim)" }}>{w.count}</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{money(w.total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {data.isToday && data.open.length > 0 && (
            <div className="m-section">
              <div className="m-section-title">En curso ahora ({data.open.length})</div>
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Mozo</th>
                    <th>Abierto hace</th>
                    <th style={{ textAlign: "right" }}>Productos</th>
                    <th style={{ textAlign: "right" }}>Parcial</th>
                  </tr>
                </thead>
                <tbody>
                  {data.open.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {o.label}
                        {o.partySize ? <span style={{ color: "var(--text-dim)" }}> · {o.partySize} pers.</span> : null}
                      </td>
                      <td>{o.waiter ?? "—"}</td>
                      <td>{fmtMinutes(minutesBetween(o.openedAt, null))}</td>
                      <td style={{ textAlign: "right" }}>{o.items.reduce((s, it) => s + it.qty, 0)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{money(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="prod-toolbar">
            <input
              type="search"
              className="prod-search"
              placeholder="Buscar por mesa, cliente, mozo o producto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {(kind || table !== null || query) && (
              <button
                type="button"
                className="prod-filter"
                onClick={() => {
                  setKind(null);
                  setTable(null);
                  setQuery("");
                }}
              >
                Quitar filtros
              </button>
            )}
          </div>

          <div className="m-section">
            <div className="m-section-title">
              Ventas cobradas ({sales.length}
              {sales.length !== data.count ? ` de ${data.count}` : ""}) · {money(shownTotal)}
            </div>
            <table className="m-table">
              <thead>
                <tr>
                  <th>Cobrada</th>
                  <th>Venta</th>
                  <th>Mozo</th>
                  <th>Pago</th>
                  <th>Cobró</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="m-empty">
                      {data.count === 0 ? "No hubo ventas cobradas en esta jornada." : "Ninguna venta coincide con el filtro."}
                    </td>
                  </tr>
                ) : (
                  sales.map((s) => (
                    <Fragment key={s.id}>
                      <tr className="sales-row" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                        <td>{hhmm(s.closedAt)}</td>
                        <td>
                          <strong>{s.label}</strong>
                          {s.zone && <span style={{ color: "var(--text-dim)" }}> · {s.zone}</span>}
                          {s.partySize ? <span style={{ color: "var(--text-dim)" }}> · {s.partySize} pers.</span> : null}
                        </td>
                        <td>{s.waiter ?? "—"}</td>
                        <td>{payLabel(s)}</td>
                        <td>{s.closedBy ?? "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{money(s.total)}</td>
                      </tr>
                      {expanded === s.id && (
                        <tr className="sales-detail">
                          <td colSpan={6}>
                            <div className="sales-detail-box">
                              <div>
                                {s.items.map((it, i) => (
                                  <div key={i} className="sales-item">
                                    <span>
                                      {it.qty} × {it.name}
                                      {it.note && <em> — {it.note}</em>}
                                    </span>
                                    <span>{money(it.price * it.qty)}</span>
                                  </div>
                                ))}
                                {s.items.length === 0 && <div className="m-empty">Sin productos registrados.</div>}
                              </div>
                              <div className="sales-meta">
                                <div>
                                  Abierta {hhmm(s.openedAt)} · cobrada {hhmm(s.closedAt)} ({fmtMinutes(minutesBetween(s.openedAt, s.closedAt))})
                                </div>
                                {s.payments.map((p, i) => (
                                  <div key={i}>
                                    {PAY_LABEL[p.method] ?? p.method}: {money(p.amount)}
                                  </div>
                                ))}
                                {s.customerName && s.kind === "mesa" && <div>Cliente: {s.customerName}</div>}
                                {s.notes && <div>Nota: {s.notes}</div>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
