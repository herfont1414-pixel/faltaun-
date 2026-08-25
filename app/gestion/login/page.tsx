"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GestionLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/gestion/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Contraseña incorrecta");
      return;
    }

    router.push("/gestion");
    router.refresh();
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
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 32,
          width: 320,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 22, color: "#ff5a1f", marginBottom: 4 }}>
          GastroSys
        </div>
        <p style={{ fontSize: 13, color: "#767672", marginBottom: 20 }}>Madero Resto</p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña del local"
          autoFocus
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 9,
            border: "1px solid #e2e2df",
            fontSize: 14,
            marginBottom: 12,
          }}
        />

        {error && (
          <p style={{ color: "#e5533d", fontSize: 12.5, marginBottom: 12 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 9,
            border: "none",
            background: "#ff5a1f",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
