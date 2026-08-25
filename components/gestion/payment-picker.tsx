"use client";

import { useState } from "react";
import { money } from "@/lib/gestion/format";
import type { Customer, PaymentMethod } from "@/lib/gestion/types";

interface PaymentPickerProps {
  total: number;
  onCancel: () => void;
  onConfirm: (method: PaymentMethod, customerId: number | null) => void;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cuenta_corriente", label: "Cta. Cte." },
];

export function PaymentPicker({ total, onCancel, onConfirm }: PaymentPickerProps) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [searching, setSearching] = useState(false);

  async function search(value: string) {
    setQuery(value);
    setSelected(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const res = await fetch(`/api/gestion/customers?q=${encodeURIComponent(value)}`);
    const data = await res.json();
    setResults(data.customers ?? []);
    setSearching(false);
  }

  const canConfirm = method === "cuenta_corriente" ? Boolean(selected) : Boolean(method);

  return (
    <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
      <div className="ticket-title">Medio de pago</div>
      <div className="footer-actions" style={{ marginBottom: 8 }}>
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            className={`btn ${method === m.value ? "btn-primary" : ""}`}
            onClick={() => setMethod(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {method === "cuenta_corriente" && (
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

      <div className="footer-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canConfirm}
          onClick={() => method && onConfirm(method, selected?.id ?? null)}
        >
          Confirmar cobro · {money(total)}
        </button>
      </div>
    </div>
  );
}
