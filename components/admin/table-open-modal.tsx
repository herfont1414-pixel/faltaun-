"use client";

import { useState } from "react";

interface TableOpenModalProps {
  tableNumber: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (details: { partySize: number; customerName: string; waiter: string; notes: string }) => void;
}

export function TableOpenModal({ tableNumber, busy, onCancel, onConfirm }: TableOpenModalProps) {
  const [partySize, setPartySize] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [waiter, setWaiter] = useState("");
  const [notes, setNotes] = useState("");

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 13,
    marginTop: 5,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-dim)",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, padding: 22, width: 340 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 2 }}>Abrir Mesa {tableNumber}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 16 }}>
          Datos opcionales — podés dejarlos vacíos y cargar todo después.
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Personas</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <button
              type="button"
              className="btn"
              style={{ flex: "none", width: 36, height: 36, padding: 0, fontSize: 18, fontWeight: 800 }}
              onClick={() => setPartySize((n) => Math.max(1, n - 1))}
            >
              −
            </button>
            <span style={{ fontSize: 20, fontWeight: 800, minWidth: 24, textAlign: "center" }}>
              {partySize}
            </span>
            <button
              type="button"
              className="btn"
              style={{ flex: "none", width: 36, height: 36, padding: 0, fontSize: 18, fontWeight: 800 }}
              onClick={() => setPartySize((n) => n + 1)}
            >
              +
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Cliente</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nombre (opcional)"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Camarero</label>
          <input
            value={waiter}
            onChange={(e) => setWaiter(e.target.value)}
            placeholder="Quién atiende la mesa (opcional)"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Comentario</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: cumpleaños, alergia, mesa junto a la ventana..."
            rows={2}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <div className="footer-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onConfirm({ partySize, customerName, waiter, notes })}
          >
            Abrir mesa
          </button>
        </div>
      </div>
    </div>
  );
}
