"use client";

import { useEffect, useState } from "react";

interface Ingredient {
  id: number;
  category: string | null;
  name: string;
  cost: number;
  supplier: string | null;
  unit: string;
}

export function IngredientesView() {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch("/api/admin/ingredients").then(async (res) => {
      if (res.status === 401) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setIngredients(data.ingredients ?? []);
    });
  }, []);

  async function saveCost(id: number, cost: number) {
    setSavingId(id);
    const res = await fetch(`/api/admin/ingredients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cost }),
    });
    const data = await res.json();
    setSavingId(null);
    if (res.ok && data.ingredient) {
      setIngredients((prev) => (prev ?? []).map((i) => (i.id === id ? data.ingredient : i)));
    }
  }

  if (forbidden) {
    return (
      <div className="mostrador">
        <h1 style={{ marginBottom: 6 }}>Ingredientes</h1>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
          Solo administradores y encargados pueden ver los costos de ingredientes.
        </p>
      </div>
    );
  }

  if (!ingredients) {
    return <div className="mostrador">Cargando ingredientes…</div>;
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Ingredientes</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 20, maxWidth: 560 }}>
        El costo de cada ingrediente se usa para calcular el costo y el margen de las recetas en
        Productos → Receta. Cambiar un costo acá recalcula automáticamente todas las recetas que usan
        ese ingrediente — nunca cambia el precio ya cobrado en ventas pasadas.
      </p>
      <table className="m-table">
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Nombre</th>
            <th>Unidad</th>
            <th>Proveedor</th>
            <th style={{ textAlign: "right" }}>Costo</th>
          </tr>
        </thead>
        <tbody>
          {ingredients.length === 0 ? (
            <tr>
              <td colSpan={5} className="m-empty">
                Sin ingredientes cargados.
              </td>
            </tr>
          ) : (
            ingredients.map((i) => (
              <tr key={i.id}>
                <td style={{ fontSize: 12 }}>{i.category ?? "—"}</td>
                <td>{i.name}</td>
                <td style={{ fontSize: 12 }}>{i.unit}</td>
                <td style={{ fontSize: 12, color: "var(--text-dim)" }}>{i.supplier ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <input
                    type="number"
                    defaultValue={i.cost}
                    disabled={savingId === i.id}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value) && value !== i.cost) saveCost(i.id, value);
                    }}
                    style={{
                      width: 100,
                      padding: "5px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      fontSize: 13,
                      textAlign: "right",
                    }}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
