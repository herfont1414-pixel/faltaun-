"use client";

import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/admin/format";
import type { WebOrder } from "@/lib/admin/types";

interface CrmCustomer {
  phone: string;
  name: string | null;
  address: string | null;
  stamps: number;
  orderCount: number;
  totalSpent: number;
  origin: string | null;
  cuentaCorriente: boolean;
  ccBalance: number | null;
}

const ORIGIN_LABEL: Record<string, string> = {
  web: "Menú online",
  delivery: "Delivery (panel)",
  mesa: "Mesa",
  mostrador: "Mostrador",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function ClientesView() {
  const [customers, setCustomers] = useState<CrmCustomer[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CrmCustomer | null>(null);
  const [orders, setOrders] = useState<WebOrder[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/crm-customers")
      .then((res) => res.json())
      .then((data: { customers: CrmCustomer[] }) => setCustomers(data.customers ?? []));
  }, []);

  useEffect(() => {
    if (!selected) {
      setOrders(null);
      return;
    }
    setOrders(null);
    fetch(`/api/admin/crm-customers/${encodeURIComponent(selected.phone)}/orders`)
      .then((res) => res.json())
      .then((data: { orders: WebOrder[] }) => setOrders(data.orders ?? []));
  }, [selected]);

  const filtered = useMemo(() => {
    const list = customers ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) => (c.name ?? "").toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    );
  }, [customers, query]);

  if (!customers) {
    return <div className="mostrador">Cargando clientes…</div>;
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 14 }}>Clientes</h1>

      <div className="m-section">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono..."
          className="caja-input"
          style={{ maxWidth: 340, marginBottom: 14 }}
        />

        <table className="m-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th style={{ textAlign: "right" }}>Pedidos</th>
              <th style={{ textAlign: "right" }}>Gastado</th>
              <th style={{ textAlign: "right" }}>Sellos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="m-empty">
                  Sin clientes todavía.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.phone}
                  className="m-row-strip"
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(c)}
                >
                  <td>
                    {c.name || "Sin nombre"}
                    {c.cuentaCorriente && (
                      <span className="pill cerrada" style={{ marginLeft: 8 }}>
                        Cta. Cte.
                      </span>
                    )}
                  </td>
                  <td>{c.phone}</td>
                  <td style={{ textAlign: "right" }}>{c.orderCount}</td>
                  <td className="m-total">{money(c.totalSpent)}</td>
                  <td style={{ textAlign: "right" }}>{c.stamps}</td>
                  <td style={{ textAlign: "right", color: "var(--text-faint)" }}>Ver →</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 20,
              width: 380,
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 2 }}>
              {selected.name || "Sin nombre"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>{selected.phone}</div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <div className="caja-stat" style={{ minWidth: 100 }}>
                <div className="cs-label">Pedidos</div>
                <div className="cs-value">{selected.orderCount}</div>
              </div>
              <div className="caja-stat" style={{ minWidth: 100 }}>
                <div className="cs-label">Gastado</div>
                <div className="cs-value">{money(selected.totalSpent)}</div>
              </div>
              <div className="caja-stat" style={{ minWidth: 100 }}>
                <div className="cs-label">Sellos</div>
                <div className="cs-value">{selected.stamps}</div>
              </div>
            </div>

            {selected.address && (
              <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                <strong>Dirección:</strong> {selected.address}
              </div>
            )}
            {selected.origin && (
              <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                <strong>Origen:</strong> {ORIGIN_LABEL[selected.origin] ?? selected.origin}
              </div>
            )}
            {selected.cuentaCorriente && (
              <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                <strong>Saldo cta. cte.:</strong> {money(selected.ccBalance ?? 0)}
              </div>
            )}

            <div style={{ marginTop: 14, fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>
              Pedidos del menú online
            </div>
            {orders === null ? (
              <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Cargando...</div>
            ) : orders.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Sin pedidos desde el menú.</div>
            ) : (
              orders.slice(0, 8).map((o) => (
                <div
                  key={o.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12.5,
                    padding: "6px 0",
                    borderBottom: "1px solid #f2f2f0",
                  }}
                >
                  <span>{fmtDate(o.createdAt)}</span>
                  <span>{money(o.total)}</span>
                </div>
              ))
            )}

            <button
              type="button"
              className="btn"
              style={{ width: "100%", marginTop: 14 }}
              onClick={() => setSelected(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
