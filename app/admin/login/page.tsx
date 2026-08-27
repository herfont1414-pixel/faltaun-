"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Delete } from "lucide-react";

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export default function AdminLoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(value: string) {
    setLoading(true);
    setError("");

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: value }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("PIN incorrecto");
      setPin("");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  function press(key: string) {
    if (loading) return;
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "") return;
    setError("");
    setPin((p) => {
      const next = (p + key).slice(0, PIN_LENGTH);
      if (next.length === PIN_LENGTH) submit(next);
      return next;
    });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#eef0ee",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 32,
          width: 300,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <img
          src="/logo-light.png"
          alt="Madero Restó"
          style={{ height: 56, width: "auto", margin: "0 auto 6px" }}
        />
        <p style={{ fontSize: 12, letterSpacing: 1, color: "#767672", marginBottom: 20 }}>
          MADEROSYS
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 10 }}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "1.5px solid #ff5a1f",
                background: i < pin.length ? "#ff5a1f" : "transparent",
              }}
            />
          ))}
        </div>

        <p style={{ color: "#e5533d", fontSize: 12.5, marginBottom: 10, minHeight: 16 }}>
          {error}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {KEYS.map((key, i) =>
            key === "" ? (
              <div key={i} />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => press(key)}
                disabled={loading}
                style={{
                  height: 58,
                  borderRadius: 12,
                  border: "1px solid #e2e2df",
                  background: "#f7f7f6",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#2c2c2a",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {key === "back" ? <Delete size={20} /> : key}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
