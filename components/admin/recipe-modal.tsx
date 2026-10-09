"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { money } from "@/lib/admin/format";

interface Ingredient {
  id: number;
  name: string;
  unit: string;
  cost: number;
}

interface RecipeDetail {
  productId: number;
  productName: string;
  salePrice: number;
  items: { ingredientId: number; ingredientName: string; unit: string; quantity: number; unitCost: number; lineCost: number }[];
  costTotal: number;
  margin: number;
  marginPct: number | null;
}

interface Line {
  key: string;
  ingredientId: number | "";
  quantity: string;
}

export function RecipeModal({ productId, onClose }: { productId: number; onClose: () => void }) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/recipes/${productId}`).then((r) => r.json()),
      fetch("/api/admin/ingredients").then((r) => r.json()),
    ]).then(([recipeData, ingredientsData]) => {
      setRecipe(recipeData.recipe ?? null);
      setIngredients(ingredientsData.ingredients ?? []);
      const initial: Line[] = (recipeData.recipe?.items ?? []).map((it: any, i: number) => ({
        key: `${i}`,
        ingredientId: it.ingredientId,
        quantity: String(it.quantity),
      }));
      setLines(initial.length ? initial : [{ key: "0", ingredientId: "", quantity: "" }]);
    });
  }, [productId]);

  function addLine() {
    setLines((prev) => [...prev, { key: `${Date.now()}`, ingredientId: "", quantity: "" }]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const liveCostTotal = lines.reduce((sum, l) => {
    const ing = ingredients.find((i) => i.id === l.ingredientId);
    const qty = Number(l.quantity) || 0;
    return sum + (ing ? ing.cost * qty : 0);
  }, 0);
  const salePrice = recipe?.salePrice ?? 0;
  const liveMargin = salePrice - liveCostTotal;
  const liveMarginPct = salePrice > 0 ? (liveMargin / salePrice) * 100 : null;

  async function save() {
    setSaving(true);
    setError("");
    const items = lines
      .filter((l) => l.ingredientId !== "" && Number(l.quantity) > 0)
      .map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity) }));
    const res = await fetch(`/api/admin/recipes/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar la receta");
      return;
    }
    onClose();
  }

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
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, padding: 22, width: 420, maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 2 }}>
          Receta — {recipe?.productName ?? "Cargando..."}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 16 }}>
          Precio de venta: {money(salePrice)}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {lines.map((line) => (
            <div key={line.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                value={line.ingredientId}
                onChange={(e) => updateLine(line.key, { ingredientId: Number(e.target.value) })}
                style={{ flex: 1, padding: "7px 8px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5 }}
              >
                <option value="" disabled>
                  Ingrediente...
                </option>
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name} ({ing.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={line.quantity}
                onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                placeholder="Cant."
                style={{ width: 70, padding: "7px 8px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5 }}
              />
              <button
                type="button"
                onClick={() => removeLine(line.key)}
                aria-label="Quitar ingrediente"
                style={{ flexShrink: 0, width: 28, height: 28, border: "none", background: "transparent", color: "var(--text-faint)", cursor: "pointer" }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="btn" style={{ marginBottom: 14 }} onClick={addLine}>
          + Agregar ingrediente
        </button>

        <div className="caja-card" style={{ marginBottom: 14, fontSize: 12.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>Costo total</span>
            <strong>{money(liveCostTotal)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>Margen bruto</span>
            <strong style={{ color: liveMargin < 0 ? "var(--red)" : "var(--green-dark)" }}>
              {money(liveMargin)}
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>% de margen</span>
            <strong>{liveMarginPct === null ? "—" : `${liveMarginPct.toFixed(1)}%`}</strong>
          </div>
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

        <div className="footer-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            Guardar receta
          </button>
        </div>
      </div>
    </div>
  );
}
