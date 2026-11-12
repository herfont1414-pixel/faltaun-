"use client";

import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/admin/format";
import type { LoyaltyRanking, LoyaltyRankingRow } from "@/lib/admin/loyalty-ranking";

type SortKey = "stamps" | "recent" | "spent" | "near";

const EMOJI: Record<string, string> = { papas: "🍟", burger: "🍔" };

function daysAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const date = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  if (days <= 0) return `hoy · ${date}`;
  if (days === 1) return `ayer · ${date}`;
  return `hace ${days} días · ${date}`;
}

function plain(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", minWidth: 150, background: "#fff", flex: "1 1 150px" }}>
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{hint}</div>}
    </div>
  );
}

// Barrita de progreso hacia el próximo premio.
function Progress({ row }: { row: LoyaltyRankingRow }) {
  if (!row.next) return <span style={{ color: "var(--text-faint)" }}>—</span>;
  const pct = Math.max(4, Math.min(100, (row.stamps / row.next.milestone) * 100));
  const near = row.next.remaining <= 2;
  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ fontSize: 12.5, fontWeight: near ? 700 : 500, color: near ? "#b45309" : undefined }}>
        {EMOJI[row.next.rewardCode] ?? "🎁"} {row.next.rewardName}: falta{row.next.remaining === 1 ? "" : "n"} {row.next.remaining}
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "#eee", marginTop: 4 }}>
        <div style={{ width: `${pct}%`, height: 6, borderRadius: 4, background: near ? "#f59e0b" : "#ff5a1f" }} />
      </div>
    </div>
  );
}

function toCsv(rows: LoyaltyRankingRow[]) {
  const head = ["Puesto", "Cliente", "Teléfono", "Sellos", "Próximo premio", "Faltan", "Premios para entregar", "Premios canjeados", "Compras", "Gastado", "Sellos últimos 30 días", "Último sello"];
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r, i) =>
    [i + 1, r.name ?? "", r.phone, r.stamps, r.next?.rewardName ?? "", r.next?.remaining ?? "", r.pendingRewards, r.redeemedRewards, r.orderCount, r.totalSpent, r.stamps30d, r.lastStampAt ?? ""].map(esc).join(";")
  );
  return "﻿" + [head.map(esc).join(";"), ...lines].join("\r\n");
}

export function FidelidadRankingView({ onOpenCustomer }: { onOpenCustomer: (phone: string) => void }) {
  const [data, setData] = useState<LoyaltyRanking | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("stamps");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/api/admin/loyalty?ranking=1", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la tabla");
        setData(json as LoyaltyRanking);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = plain(query.trim());
    const digits = query.replace(/\D/g, "");
    let list = data.rows.filter((r) => showAll || r.stamps > 0 || r.pendingRewards > 0);
    if (q) list = list.filter((r) => plain(r.name ?? "").includes(q) || (digits.length >= 3 && r.phone.replace(/\D/g, "").includes(digits)));
    const by: Record<SortKey, (a: LoyaltyRankingRow, b: LoyaltyRankingRow) => number> = {
      stamps: (a, b) => b.stamps - a.stamps || b.totalSpent - a.totalSpent,
      recent: (a, b) => (b.lastStampAt ?? "").localeCompare(a.lastStampAt ?? ""),
      spent: (a, b) => b.totalSpent - a.totalSpent,
      near: (a, b) => (a.next?.remaining ?? 999) - (b.next?.remaining ?? 999) || b.stamps - a.stamps,
    };
    return [...list].sort(by[sort]);
  }, [data, query, sort, showAll]);

  function download() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fidelidad-sellos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (error) return <div className="mostrador"><h1>Fidelidad</h1><p>{error}</p></div>;
  if (!data) return <div className="mostrador">Cargando…</div>;
  const s = data.summary;

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Fidelidad · Sellos de clientes</h1>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-faint)" }}>
        Todos los clientes con sellos, ordenados como una tabla de posiciones. Tocá un cliente para ver su ficha, sus premios y registrar una entrega.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <Stat label="Clientes con sellos" value={s.customers} />
        <Stat label="Sellos en total" value={s.totalStamps} />
        <Stat label="A 1 o 2 sellos de un premio" value={s.nearReward} hint="buenos para avisarles" />
        <Stat label="Premios para entregar" value={s.pendingRewards} />
        <Stat label="Premios ya canjeados" value={s.redeemedRewards} />
        <Stat label="Sumaron sellos (30 días)" value={s.activeLast30d} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o teléfono…" className="caja-input" style={{ maxWidth: 280 }} />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="caja-input" style={{ maxWidth: 230 }}>
          <option value="stamps">Más sellos primero</option>
          <option value="near">Más cerca de un premio</option>
          <option value="recent">Último sello más reciente</option>
          <option value="spent">Más gastado</option>
        </select>
        <label style={{ fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Incluir clientes sin sellos
        </label>
        <button type="button" className="btn" style={{ flex: "none", marginLeft: "auto" }} onClick={download} disabled={rows.length === 0}>
          Descargar (Excel)
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="m-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th style={{ textAlign: "right" }}>Sellos</th>
              <th>Próximo premio</th>
              <th style={{ textAlign: "right" }}>Para entregar</th>
              <th style={{ textAlign: "right" }}>Canjeados</th>
              <th style={{ textAlign: "right" }}>Compras</th>
              <th style={{ textAlign: "right" }}>Gastado</th>
              <th>Último sello</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="m-empty">{query ? "Nadie coincide con la búsqueda." : "Todavía no hay clientes con sellos."}</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.phone} className="m-row-strip" style={{ cursor: "pointer" }} onClick={() => onOpenCustomer(r.phone)} title="Ver ficha del cliente">
                  <td style={{ fontWeight: 700 }}>{sort === "stamps" && i < 3 && !query ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.name || "Sin nombre"}</td>
                  <td>{r.phone}</td>
                  <td style={{ textAlign: "right", fontSize: 16, fontWeight: 800 }}>{r.stamps}</td>
                  <td><Progress row={r} /></td>
                  <td style={{ textAlign: "right" }}>
                    {r.pendingRewards > 0 ? (
                      <span style={{ background: "#fff3e0", color: "#b45309", borderRadius: 999, padding: "2px 9px", fontWeight: 700 }}>{r.pendingRewards}</span>
                    ) : (
                      0
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>{r.redeemedRewards}</td>
                  <td style={{ textAlign: "right" }}>{r.orderCount}</td>
                  <td style={{ textAlign: "right" }}>{money(r.totalSpent)}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                    {daysAgo(r.lastStampAt)}
                    {r.stamps30d > 0 && <div style={{ color: "var(--text-faint)" }}>{r.stamps30d} en 30 días</div>}
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
