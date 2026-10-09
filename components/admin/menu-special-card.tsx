"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/admin/format";
import type { AdminProduct } from "@/lib/admin/types";

interface Special {
  active: boolean;
  productId: number | null;
  text: string;
}

const TEXT_MAX = 140;

// Tarjeta de Configuración para elegir el "Especial del día" que se muestra
// arriba del menú online: producto, texto breve y un interruptor.
export function MenuSpecialCard() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [saved, setSaved] = useState<Special | null>(null);
  const [active, setActive] = useState(false);
  const [productId, setProductId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/products").then((r) => r.json()),
      fetch("/api/admin/menu-special").then((r) => r.json()),
    ])
      .then(([p, s]: [{ products?: AdminProduct[] }, { special?: Special }]) => {
        setProducts((p.products ?? []).filter((x) => x.active));
        if (s.special) {
          setSaved(s.special);
          setActive(s.special.active);
          setProductId(s.special.productId);
          setText(s.special.text);
        }
      })
      .catch(() => setError("No se pudo cargar el especial del día"));
  }, []);

  const product = products.find((p) => p.id === productId) ?? null;
  const dirty =
    !saved || saved.active !== active || saved.productId !== productId || saved.text !== text.trim();
  const categories = Array.from(new Set(products.map((p) => p.category)));

  async function save() {
    setSaving(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/admin/menu-special", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active, productId, text }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    setSaved(data.special);
    setText(data.special.text);
    setMsg(data.special.active ? "Guardado: el especial ya se ve en el menú online" : "Guardado: el especial está apagado");
  }

  return (
    <div className="m-section">
      <div className="m-section-title">Especial del día (menú online)</div>
      <div className="caja-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className={`btn ${active ? "btn-primary" : ""}`}
            style={{ flex: "none", padding: "8px 14px" }}
            onClick={() => setActive((v) => !v)}
          >
            {active ? "Activo" : "Apagado"}
          </button>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
            {active ? "Se muestra arriba del menú online" : "No se muestra en el menú online"}
          </span>
        </div>

        <label style={{ fontSize: 12.5, fontWeight: 600 }}>
          Producto
          <select
            value={productId ?? ""}
            onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : null)}
            className="caja-input"
            style={{ marginTop: 6, width: "100%" }}
          >
            <option value="">Elegí un producto</option>
            {categories.map((cat) => (
              <optgroup key={cat} label={cat}>
                {products
                  .filter((p) => p.category === cat)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(p.price)}
                      {p.inStock ? "" : " (sin stock)"}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {product && !product.inStock && (
            <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#b45309" }}>
              Este producto está sin stock: mientras tanto el especial no se muestra en el menú.
            </span>
          )}
          <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
            El precio es siempre el vigente del producto; para cambiarlo, editalo en Productos.
          </span>
        </label>

        <label style={{ fontSize: 12.5, fontWeight: 600 }}>
          Texto breve (opcional)
          <input
            type="text"
            value={text}
            maxLength={TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ej: Con papas y bebida incluida, solo por hoy"
            className="caja-input"
            style={{ marginTop: 6, width: "100%" }}
          />
          <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
            {text.length}/{TEXT_MAX}
          </span>
        </label>

        {error && <div style={{ fontSize: 12.5, color: "#b91c1c" }}>{error}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: "none", padding: "10px 16px" }}
            disabled={saving || !dirty}
            onClick={save}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{msg}</span>
        </div>
      </div>
    </div>
  );
}
