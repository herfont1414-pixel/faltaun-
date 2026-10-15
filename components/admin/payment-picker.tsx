"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { money } from "@/lib/admin/format";
import { changeCents, fromCents, toCents } from "@/lib/admin/payments";
import type { Customer, OrderPayment, PaymentMethod } from "@/lib/admin/types";

interface PaymentPickerProps {
  total: number;
  onCancel: () => void;
  onConfirm: (payments: OrderPayment[], customerId: number | null, loyaltyPhone: string | null) => void;
  onPartial: () => void;
  // Lo que el cliente dijo al pedir por la web: precarga el medio y, en efectivo, con cuánto paga.
  hint?: { method: "efectivo" | "transferencia"; cashGiven: number | null } | null;
}

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cuenta_corriente", label: "Cta. Cte." },
];

interface Line {
  key: string;
  method: PaymentMethod;
  amount: string;
  received: string;
}

const inputStyle: React.CSSProperties = {
  padding: "8px 9px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 14,
  textAlign: "right",
  width: "100%",
};

function amountToString(cents: number) {
  return cents > 0 ? String(fromCents(cents)) : "";
}

export function PaymentPicker({ total, onCancel, onConfirm, onPartial, hint }: PaymentPickerProps) {
  const [lines, setLines] = useState<Line[]>([
    {
      key: "0",
      method: hint?.method ?? "efectivo",
      amount: amountToString(toCents(total)),
      // "Con cuánto paga" solo se precarga si alcanza para el total actual.
      received:
        hint?.method === "efectivo" && hint.cashGiven !== null && toCents(hint.cashGiven) >= toCents(total)
          ? String(hint.cashGiven)
          : "",
    },
  ]);
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

  function setMethod(key: string, method: PaymentMethod) {
    // "Recibido" solo existe para efectivo.
    updateLine(key, method === "efectivo" ? { method } : { method, received: "" });
  }

  const totalCents = toCents(total);
  const lineInfo = lines.map((l) => {
    const amountCents = toCents(Number(l.amount) || 0);
    const receivedFilled = l.method === "efectivo" && l.received.trim() !== "";
    const receivedCents = receivedFilled ? toCents(Number(l.received) || 0) : null;
    return {
      amountCents,
      amountOk: amountCents > 0,
      receivedFilled,
      receivedOk: !receivedFilled || (receivedCents !== null && receivedCents >= amountCents),
      changeCents: changeCents(amountCents, receivedCents),
    };
  });

  const paidCents = lineInfo.reduce((s, i) => s + i.amountCents, 0);
  const remainingCents = totalCents - paidCents;
  const covered = remainingCents === 0;
  const needsCustomer = lines.some((l) => l.method === "cuenta_corriente");
  const canConfirm =
    covered &&
    lineInfo.every((i) => i.amountOk && i.receivedOk) &&
    (!needsCustomer || Boolean(selected));

  function addLine() {
    // La línea nueva arranca con lo que falta cubrir y con un medio que todavía
    // no se usó (lo más común es efectivo + transferencia).
    const used = new Set(lines.map((l) => l.method));
    const method = METHODS.find((m) => !used.has(m.value))?.value ?? "transferencia";
    setLines((prev) => [
      ...prev,
      { key: `${Date.now()}`, method, amount: amountToString(Math.max(0, remainingCents)), received: "" },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function handleConfirm() {
    const payments: OrderPayment[] = lines.map((l, i) => ({
      method: l.method,
      amount: fromCents(lineInfo[i].amountCents),
      ...(lineInfo[i].receivedFilled ? { received: Number(l.received) } : {}),
    }));
    onConfirm(payments, selected?.id ?? null, loyaltyPhone.trim() || null);
  }

  const summaryColor = covered ? "var(--green-dark)" : "var(--red)";

  return (
    <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", maxHeight: "65vh", overflowY: "auto" }}>
      <div className="ticket-title">Medios de pago</div>
      {hint && (
        <div
          data-testid="pay-hint"
          style={{
            margin: "6px 0 10px",
            padding: "8px 10px",
            borderRadius: 10,
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            fontSize: 12.5,
          }}
        >
          {hint.method === "transferencia"
            ? "El cliente dijo que paga por transferencia: verificá el comprobante antes de cobrar."
            : hint.cashGiven !== null
              ? `El cliente dijo que paga en efectivo con ${money(hint.cashGiven)}.`
              : "El cliente dijo que paga en efectivo."}
        </div>
      )}

      {!partial && (
        <>
          <div
            data-testid="pay-summary"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 6,
              marginBottom: 10,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Total</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{money(total)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Pagado</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{money(fromCents(paidCents))}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{remainingCents < 0 ? "Sobran" : "Restante"}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: summaryColor }}>
                {money(fromCents(Math.abs(remainingCents)))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            {lines.map((line, idx) => {
              const info = lineInfo[idx];
              return (
                <div
                  key={line.key}
                  data-testid="pay-line"
                  style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 8 }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 6, flex: 1 }}>
                      {METHODS.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          className={`btn ${line.method === m.value ? "btn-primary" : ""}`}
                          style={{ flex: 1, padding: "9px 4px", fontSize: 12.5 }}
                          aria-pressed={line.method === m.value}
                          onClick={() => setMethod(line.key, m.value)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
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

                  <div style={{ display: "flex", gap: 8 }}>
                    <label style={{ flex: 1, fontSize: 11.5, color: "var(--text-dim)" }}>
                      Monto
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={line.amount}
                        onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                        placeholder="0"
                        aria-label="Monto"
                        style={inputStyle}
                      />
                    </label>
                    {line.method === "efectivo" && (
                      <label style={{ flex: 1, fontSize: 11.5, color: "var(--text-dim)" }}>
                        Recibido
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={line.received}
                          onChange={(e) => updateLine(line.key, { received: e.target.value })}
                          placeholder="Opcional"
                          aria-label="Recibido"
                          style={inputStyle}
                        />
                      </label>
                    )}
                  </div>

                  {line.method === "efectivo" && info.receivedFilled && (
                    <div
                      data-testid="pay-change"
                      style={{
                        marginTop: 6,
                        fontSize: 14,
                        fontWeight: 700,
                        textAlign: "right",
                        color: info.receivedOk ? "var(--green-dark)" : "var(--red)",
                      }}
                    >
                      {info.receivedOk ? `Vuelto: ${money(fromCents(info.changeCents))}` : "El recibido no alcanza"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" className="btn" style={{ marginBottom: 8, width: "100%" }} onClick={addLine}>
            + Agregar medio de pago
          </button>

          {needsCustomer && (
            <div style={{ marginBottom: 8 }}>
              <input
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Cuenta corriente: buscar cliente por nombre..."
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

      <div
        className="footer-actions"
        style={{ position: "sticky", bottom: 0, background: "var(--card)", paddingTop: 8, paddingBottom: 2 }}
      >
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
