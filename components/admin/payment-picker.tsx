"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { money } from "@/lib/admin/format";
import type { Customer, OrderPayment, PaymentMethod } from "@/lib/admin/types";

interface PaymentPickerProps {
  total: number;
  onCancel: () => void;
  onConfirm: (payments: OrderPayment[], customerId: number | null, loyaltyPhone: string | null) => void;
  onPartial: () => void;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cuenta_corriente", label: "Cta. Cte." },
];

interface Line {
  key: string;
  method: PaymentMethod | "";
  amount: string;
}

const selectStyle: React.CSSProperties = {
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 12.5,
  flex: 1,
};
const amountStyle: React.CSSProperties = {
  width: 92,
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 12.5,
  textAlign: "right",
};

export function PaymentPicker({ total, onCancel, onConfirm, onPartial }: PaymentPickerProps) {
  const [lines, setLines] = useState<Line[]>([{ key: "0", method: "", amount: total.toFixed(2) }]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [searching, setSearching] = useState(false);
  const [loyaltyPhone, setLoyaltyPhone] = useState("");
  const [partial, setPartial] = useState(false);

  async function search(value: string) {
    setQuery(value);
    setSelected(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(value)}`);
    const data = await res.json();
    setResults(data.customers ?? []);
    setSearching(false);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const sum = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const rest = Math.max(0, Math.round((total - sum) * 100) / 100);
    setLines((prev) => [...prev, { key: `${Date.now()}`, method: "", amount: rest ? rest.toFixed(2) : "" }]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  const sum = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const remaining = Math.round((total - sum) * 100) / 100;
  const sumMatches = Math.abs(remaining) < 0.5;
  const needsCustomer = lines.some((l) => l.method === "cuenta_corriente");
  const canConfirm = lines.every((l) => l.method) && sumMatches && (!needsCustomer || Boolean(selected));

  function handleConfirm() {
    const payments: OrderPayment[] = lines.map((l) => ({
      method: l.method as PaymentMethod,
      amount: Number(l.amount) || 0,
    }));
    onConfirm(payments, selected?.id ?? null, loyaltyPhone.trim() || null);
  }

  return (
    <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
      <div className="ticket-title">Medios de pago</div>

      {!partial && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {lines.map((line) => (
              <div key={line.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select
                  value={line.method}
                  onChange={(e) => updateLine(line.key, { method: e.target.value as PaymentMethod })}
                  style={selectStyle}
                >
                  <option value="" disabled>
                    Medio de pago...
                  </option>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={line.amount}
                  onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                  placeholder="0"
                  style={amountStyle}
                />
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    aria-label="Quitar medio de pago"
                    style={{
                      flexShrink: 0,
                      width: 30,
                      height: 30,
                      border: "none",
                      background: "transparent",
                      color: "var(--text-faint)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button type="button" className="btn" style={{ marginBottom: 8 }} onClick={addLine}>
            + Agregar medio de pago
          </button>

          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              marginBottom: 10,
              color: sumMatches ? "var(--green-dark)" : "var(--red)",
            }}
          >
            {sumMatches
              ? "Cubierto ✓"
              : remaining > 0
                ? `Falta cubrir ${money(remaining)}`
                : `Sobran ${money(-remaining)}`}
          </div>

          {needsCustomer && (
            <div style={{ marginBottom: 8 }}>
              <input
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Buscar cliente por nombre..."
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  marginBottom: 6,
                }}
              />
              {selected ? (
                <div style={{ fontSize: 12.5 }}>
                  Cliente: <strong>{selected.name}</strong> · Saldo actual: {money(selected.balance)}
                </div>
              ) : (
                <div style={{ maxHeight: 140, overflowY: "auto" }}>
                  {searching && <div className="ticket-empty">Buscando...</div>}
                  {!searching &&
                    results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="product-btn"
                        style={{ width: "100%", marginBottom: 4 }}
                        onClick={() => {
                          setSelected(c);
                          setResults([]);
                        }}
                      >
                        <div className="p-name">{c.name}</div>
                        <div className="p-price">Saldo: {money(c.balance)}</div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <input
              value={loyaltyPhone}
              onChange={(e) => setLoyaltyPhone(e.target.value)}
              placeholder="Teléfono (Fidelidad) — opcional"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 13,
              }}
            />
          </div>
        </>
      )}

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12.5,
          color: "var(--text-dim)",
          marginBottom: 10,
          cursor: "pointer",
        }}
      >
        <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
        Cierre parcial — imprime la cuenta para el cliente sin cerrar la venta todavía
      </label>

      <div className="footer-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        {partial ? (
          <button type="button" className="btn btn-primary" onClick={onPartial}>
            Imprimir cuenta · {money(total)}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!canConfirm} onClick={handleConfirm}>
            Confirmar cobro · {money(total)}
          </button>
        )}
      </div>
    </div>
  );
}
