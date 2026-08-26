"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminProduct } from "@/lib/admin/types";

export function ProductsView() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/products")
      .then((res) => res.json())
      .then((data) => setProducts(data.products ?? []));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminProduct[]>();
    for (const p of products ?? []) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return map;
  }, [products]);

  async function patch(id: number, changes: { price?: number; active?: boolean }) {
    setSavingId(id);
    await fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    setProducts((prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, ...changes } : p)));
    setSavingId(null);
  }

  if (!products) {
    return <div className="mostrador">Cargando productos…</div>;
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 14 }}>Productos</h1>
      {[...grouped.entries()].map(([category, items]) => (
        <div key={category} className="m-section">
          <div className="m-section-title">{category}</div>
          <table className="m-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Precio</th>
                <th style={{ textAlign: "right" }}>Activo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.45 }}>
                  <td>{p.name}</td>
                  <td>
                    <input
                      type="number"
                      defaultValue={p.price}
                      disabled={savingId === p.id}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isNaN(value) && value !== p.price) patch(p.id, { price: value });
                      }}
                      style={{
                        width: 90,
                        padding: "5px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        fontSize: 13,
                      }}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className={`btn ${p.active ? "" : "btn-primary"}`}
                      style={{ flex: "none", padding: "6px 12px" }}
                      disabled={savingId === p.id}
                      onClick={() => patch(p.id, { active: !p.active })}
                    >
                      {p.active ? "Pausar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
