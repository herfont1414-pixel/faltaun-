"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminProduct } from "@/lib/admin/types";
import { RecipeModal } from "@/components/admin/recipe-modal";
import { DRINK_GROUPS, drinkGroupLabel, drinkGroupOf, isDrinksCategory } from "@/lib/admin/drink-groups";
import type { DrinkGroupId } from "@/lib/admin/drink-groups";

interface PrintArea {
  id: number;
  nombre: string;
}

type Filter = "todos" | "sin_stock" | "ocultos" | "pausados";

const ALL = "__todas__";
const CAT_KEY = "maderosys.productos.categoria";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "sin_stock", label: "Sin stock" },
  { id: "ocultos", label: "Ocultos del menú online" },
  { id: "pausados", label: "Pausados" },
];

// Sin stock: marcado a mano o con cantidad controlada en 0.
const isOut = (p: AdminProduct) => !p.inStock || (p.stockQty !== null && p.stockQty <= 0);

function matchesFilter(p: AdminProduct, filter: Filter) {
  if (filter === "sin_stock") return isOut(p);
  if (filter === "ocultos") return !p.showOnline;
  if (filter === "pausados") return !p.active;
  return true;
}

// Búsqueda sin importar mayúsculas ni tildes ("cafe" encuentra "Café").
const normalize = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Alta de un producto: nombre, categoría, precio y (opcional) stock y área de impresión.
function NewProductModal({
  categories,
  defaultCategory,
  printAreas,
  onClose,
  onCreated,
}: {
  categories: string[];
  defaultCategory: string;
  printAreas: PrintArea[];
  onClose: () => void;
  onCreated: (products: AdminProduct[], created: { id: number; name: string }, category: string) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [printAreaId, setPrintAreaId] = useState("");
  const [showOnline, setShowOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (name.trim().length < 2) return setError("Escribí el nombre del producto");
    if (!category) return setError("Elegí una categoría");
    if (price.trim() === "" || Number.isNaN(Number(price)) || Number(price) < 0) return setError("Poné el precio");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          price: Number(price),
          stockQty: stock.trim() === "" ? null : Number(stock),
          showOnline,
          printAreaId: printAreaId ? Number(printAreaId) : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        product?: { id: number; name: string };
        products?: AdminProduct[];
      };
      if (!res.ok || !data.product || !data.products) {
        setError(res.status === 401 ? "Solo el dueño o el encargado pueden crear productos" : data.error ?? "No se pudo guardar");
        return;
      }
      onCreated(data.products, data.product, category);
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2 style={{ margin: "0 0 12px" }}>Nuevo producto</h2>
        <div className="res-form">
          <label className="caja-field">
            <span>Nombre</span>
            <input className="caja-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Pizza Champiñon" autoFocus />
          </label>
          <label className="caja-field">
            <span>Categoría</span>
            <select className="caja-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="res-row">
            <label className="caja-field">
              <span>Precio</span>
              <input className="caja-input" type="number" min={0} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" />
            </label>
            <label className="caja-field">
              <span>Stock</span>
              <input className="caja-input" type="number" min={0} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="∞ sin control" />
            </label>
          </div>
          <label className="caja-field">
            <span>Área de impresión</span>
            <select className="caja-input" value={printAreaId} onChange={(e) => setPrintAreaId(e.target.value)}>
              <option value="">Automática (bebidas a Barra, el resto a Cocina)</option>
              {printAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={showOnline} onChange={(e) => setShowOnline(e.target.checked)} />
            Mostrarlo en el menú online
          </label>
        </div>
        {error && <div className="res-error">{error}</div>}
        <div className="footer-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Guardando…" : "Crear producto"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProductsView() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [printAreas, setPrintAreas] = useState<PrintArea[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [recipeProductId, setRecipeProductId] = useState<number | null>(null);
  // Navegación por categorías (pestañas), búsqueda y filtros rápidos.
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [creating, setCreating] = useState(false);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    fetch("/api/admin/products")
      .then((res) => res.json())
      .then((data) => setProducts(data.products ?? []));
    fetch("/api/admin/print-areas")
      .then((res) => res.json())
      .then((data: { areas: PrintArea[] }) => setPrintAreas(data.areas ?? []));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminProduct[]>();
    for (const p of products ?? []) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return map;
  }, [products]);
  // Pestañas: una por categoría, salvo "Bebidas", que se separa en Cervezas, Tragos,
  // Vinos y Sin alcohol (solo para navegar acá; la categoría real no cambia).
  const sections = useMemo(() => {
    const list: { key: string; label: string; items: AdminProduct[] }[] = [];
    for (const [cat, items] of grouped) {
      if (!isDrinksCategory(cat)) {
        list.push({ key: cat, label: cat, items });
        continue;
      }
      const byGroup = new Map<DrinkGroupId, AdminProduct[]>();
      for (const p of items) {
        const g = drinkGroupOf(p.name);
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g)!.push(p);
      }
      for (const id of [...DRINK_GROUPS.map((g) => g.id), "otras" as const]) {
        const groupItems = byGroup.get(id);
        if (groupItems?.length) list.push({ key: `${cat}::${id}`, label: drinkGroupLabel(id), items: groupItems });
      }
    }
    return list;
  }, [grouped]);
  const categories = useMemo(() => sections.map((sec) => sec.key), [sections]);

  // Se recuerda la última categoría abierta (en esta computadora).
  useEffect(() => {
    if (!categories.length || activeCat !== null) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CAT_KEY);
    } catch {
      // sin almacenamiento local: arranca en la primera categoría.
    }
    setActiveCat(saved && (saved === ALL || categories.includes(saved)) ? saved : categories[0]);
  }, [categories, activeCat]);

  function openCategory(cat: string) {
    setActiveCat(cat);
    setQuery("");
    try {
      localStorage.setItem(CAT_KEY, cat);
    } catch {
      // no pasa nada si no se puede guardar.
    }
  }

  const searching = query.trim() !== "";
  // Lo que se ve: con búsqueda, en todas las categorías; si no, la categoría elegida.
  const visible = useMemo(() => {
    const q = normalize(query.trim());
    const result = new Map<string, AdminProduct[]>();
    for (const sec of sections) {
      if (!q && activeCat !== ALL && sec.key !== activeCat) continue;
      const list = sec.items.filter((p) => (!q || normalize(p.name).includes(q)) && matchesFilter(p, filter));
      if (list.length) result.set(sec.label, list);
    }
    return result;
  }, [sections, activeCat, query, filter]);

  async function patch(
    id: number,
    changes: {
      price?: number;
      active?: boolean;
      showOnline?: boolean;
      inStock?: boolean;
      stockQty?: number | null;
      printAreaId?: number | null;
    }
  ) {
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

  const table = (items: AdminProduct[]) => (
          <table className="m-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Precio</th>
                <th>Área de impresión</th>
                <th style={{ textAlign: "right" }}>Stock</th>
                <th style={{ textAlign: "right" }}>Receta</th>
                <th style={{ textAlign: "right" }}>Menú online</th>
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
                  <td>
                    <select
                      value={p.printAreaId ?? ""}
                      disabled={savingId === p.id}
                      onChange={(e) => {
                        const value = e.target.value === "" ? null : Number(e.target.value);
                        patch(p.id, { printAreaId: value });
                      }}
                      style={{
                        padding: "5px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        fontSize: 12.5,
                        maxWidth: 140,
                      }}
                    >
                      <option value="">Sin asignar</option>
                      {printAreas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                      <input
                        type="number"
                        placeholder="∞"
                        defaultValue={p.stockQty ?? ""}
                        disabled={savingId === p.id}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const value = raw === "" ? null : Number(raw);
                          if (value === p.stockQty) return;
                          if (value !== null && Number.isNaN(value)) return;
                          patch(p.id, { stockQty: value });
                        }}
                        title="Dejar vacío = stock infinito"
                        style={{
                          width: 60,
                          padding: "5px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          fontSize: 13,
                          textAlign: "right",
                        }}
                      />
                      {p.stockQty === null && (
                        <button
                          type="button"
                          className={`btn ${p.inStock ? "" : "btn-primary"}`}
                          style={{ flex: "none", padding: "6px 12px" }}
                          disabled={savingId === p.id || !p.active}
                          onClick={() => patch(p.id, { inStock: !p.inStock })}
                        >
                          {p.inStock ? "Marcar sin stock" : "Reponer stock"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ flex: "none", padding: "6px 12px" }}
                      onClick={() => setRecipeProductId(p.id)}
                    >
                      Receta
                    </button>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <label
                      title="Si lo desactivás, el producto no aparece en el menú online (sigue en el sistema)"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={p.showOnline}
                        disabled={savingId === p.id}
                        onChange={(e) => patch(p.id, { showOnline: e.target.checked })}
                      />
                      Mostrar en el menú online
                    </label>
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
  );

  const total = products.length;
  const outCount = products.filter(isOut).length;

  return (
    <div className="mostrador">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Productos</h1>
        <button type="button" className="btn btn-primary" style={{ flex: "none" }} onClick={() => setCreating(true)}>
          + Nuevo producto
        </button>
      </div>
      {flash && <div className="prod-flash">{flash}</div>}

      <div className="prod-toolbar">
        <input
          type="search"
          className="pv-search"
          placeholder="Buscar producto en todas las categorías…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="prod-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`prod-filter ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id === "sin_stock" && outCount > 0 && <span className="prod-badge">{outCount}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="prod-tabs" role="tablist" aria-label="Categorías">
        {sections.map(({ key, label, items }) => {
          const out = items.filter(isOut).length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={!searching && activeCat === key}
              className={`prod-tab ${!searching && activeCat === key ? "active" : ""}`}
              onClick={() => openCategory(key)}
              title={out > 0 ? `${out} sin stock` : undefined}
            >
              {label}
              <span className="prod-tab-count">{items.length}</span>
              {out > 0 && <span className="prod-tab-dot" aria-label={`${out} sin stock`} />}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={!searching && activeCat === ALL}
          className={`prod-tab ${!searching && activeCat === ALL ? "active" : ""}`}
          onClick={() => openCategory(ALL)}
        >
          Todas
          <span className="prod-tab-count">{total}</span>
        </button>
      </div>

      {searching && (
        <p className="prod-hint">
          Buscando «{query.trim()}» en todas las categorías ·{" "}
          <button type="button" className="prod-link" onClick={() => setQuery("")}>
            limpiar búsqueda
          </button>
        </p>
      )}

      {visible.size === 0 ? (
        <div className="m-section">
          <p className="prod-hint" style={{ margin: 0 }}>
            {searching ? "Ningún producto coincide con la búsqueda." : "No hay productos para mostrar con este filtro."}
          </p>
        </div>
      ) : (
        [...visible.entries()].map(([category, items]) => (
          <div key={category} className="m-section">
            {(searching || activeCat === ALL) && <div className="m-section-title">{category}</div>}
            {table(items)}
          </div>
        ))
      )}

      {creating && (
        <NewProductModal
          categories={[...grouped.keys()]}
          defaultCategory={
            (activeCat && activeCat !== ALL ? activeCat.split("::")[0] : null) ?? [...grouped.keys()][0] ?? ""
          }
          printAreas={printAreas}
          onClose={() => setCreating(false)}
          onCreated={(list, created, category) => {
            setProducts(list);
            setCreating(false);
            setQuery("");
            setFilter("todos");
            const cat = list.find((p) => p.id === created.id)?.category ?? category;
            const key = isDrinksCategory(cat) ? `${cat}::${drinkGroupOf(created.name)}` : cat;
            openCategory(key);
            setFlash(`Listo: "${created.name}" ya está disponible en Mesas, Mostrador y Delivery.`);
            setTimeout(() => setFlash(""), 6000);
          }}
        />
      )}

      {recipeProductId !== null && (
        <RecipeModal productId={recipeProductId} onClose={() => setRecipeProductId(null)} />
      )}
    </div>
  );
}
