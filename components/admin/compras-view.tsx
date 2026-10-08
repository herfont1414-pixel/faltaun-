"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { money } from "@/lib/admin/format";

interface Supplier {
  id: number;
  name: string;
}
interface Ingredient {
  id: number;
  name: string;
  unit: string;
  cost: number;
}
interface SimpleProduct {
  id: number;
  name: string;
  category: string;
}
interface Purchase {
  id: string;
  supplierName: string | null;
  purchasedAt: string;
  paymentMethod: string;
  total: number;
  note: string | null;
  items: { name: string; quantity: number; unitCost: number; lineTotal: number }[];
}

interface Line {
  key: string;
  kind: "ingredient" | "product";
  itemId: number | "";
  quantity: string;
  unitCost: string;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function ComprasView() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [supplierId, setSupplierId] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: "0", kind: "ingredient", itemId: "", quantity: "", unitCost: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    fetch("/api/admin/purchases").then(async (res) => {
      if (res.status === 401) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setPurchases(data.purchases ?? []);
    });
  }

  useEffect(() => {
    load();
    fetch("/api/admin/suppliers")
      .then((r) => (r.ok ? r.json() : { suppliers: [] }))
      .then((d) => setSuppliers(d.suppliers ?? []));
    fetch("/api/admin/ingredients")
      .then((r) => (r.ok ? r.json() : { ingredients: [] }))
      .then((d) => setIngredients(d.ingredients ?? []));
    fetch("/api/admin/products")
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => setProducts(d.products ?? []));
  }, []);

  function addLine() {
    setLines((prev) => [...prev, { key: `${Date.now()}`, kind: "ingredient", itemId: "", quantity: "", unitCost: "" }]);
  }
  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }
  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  async function submit() {
    setError("");
    const items = lines
      .filter((l) => l.itemId !== "" && Number(l.quantity) > 0 && Number(l.unitCost) >= 0)
      .map((l) => ({
        ingredientId: l.kind === "ingredient" ? l.itemId : null,
        productId: l.kind === "product" ? l.itemId : null,
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost),
      }));
    if (items.length === 0) {
      setError("Agregá al menos un ítem válido");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: supplierId || null, paymentMethod, note: note.trim() || null, items }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo registrar la compra");
      return;
    }
    setLines([{ key: "0", kind: "ingredient", itemId: "", quantity: "", unitCost: "" }]);
    setSupplierId("");
    setNote("");
    load();
  }

  if (forbidden) {
    return (
      <div className="mostrador">
        <h1 style={{ marginBottom: 6 }}>Compras</h1>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
          Solo administradores y encargados pueden ver y registrar compras.
        </p>
      </div>
    );
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Compras</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 20, maxWidth: 560 }}>
        Confirmar una compra suma stock (si el ingrediente o producto lo controla), actualiza el costo del
        ingrediente para las recetas y deja constancia en la bitácora de stock.
      </p>

      <div className="m-section">
        <div className="m-section-title">Nueva compra</div>
        <div className="caja-card">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
              className="caja-input"
              style={{ flex: "1 1 180px" }}
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="caja-input"
              style={{ flex: "1 1 140px" }}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="cuenta_corriente">Cta. Cte.</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {lines.map((line) => {
              const options = line.kind === "ingredient" ? ingredients : products;
              return (
                <div key={line.key} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={line.kind}
                    onChange={(e) => updateLine(line.key, { kind: e.target.value as "ingredient" | "product", itemId: "" })}
                    style={{ padding: "7px 8px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5 }}
                  >
                    <option value="ingredient">Ingrediente</option>
                    <option value="product">Producto</option>
                  </select>
                  <select
                    value={line.itemId}
                    onChange={(e) => updateLine(line.key, { itemId: Number(e.target.value) })}
                    style={{ flex: 1, minWidth: 140, padding: "7px 8px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5 }}
                  >
                    <option value="" disabled>
                      Elegir...
                    </option>
                    {options.map((opt: any) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
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
                  <input
                    type="number"
                    value={line.unitCost}
                    onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                    placeholder="Costo unit."
                    style={{ width: 90, padding: "7px 8px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5 }}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    aria-label="Quitar ítem"
                    style={{ flexShrink: 0, width: 28, height: 28, border: "none", background: "transparent", color: "var(--text-faint)", cursor: "pointer" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" className="btn" style={{ marginBottom: 10 }} onClick={addLine}>
            + Agregar ítem
          </button>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observaciones (opcional)"
            className="caja-input"
            style={{ width: "100%", marginBottom: 10 }}
          />

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Total: {money(total)}</div>

          {error && <div className="caja-error">{error}</div>}
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            Registrar compra
          </button>
        </div>
      </div>

      <div className="m-section">
        <div className="m-section-title">Compras recientes</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Ítems</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {!purchases || purchases.length === 0 ? (
              <tr>
                <td colSpan={4} className="m-empty">
                  Todavía no hay compras registradas.
                </td>
              </tr>
            ) : (
              purchases.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontSize: 12 }}>{fmtTime(p.purchasedAt)}</td>
                  <td>{p.supplierName ?? "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {p.items.map((it) => `${it.name} x${it.quantity}`).join(", ")}
                  </td>
                  <td className="m-total">{money(p.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
