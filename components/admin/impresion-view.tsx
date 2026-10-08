"use client";

import { useEffect, useState } from "react";

interface PrintArea {
  id: number;
  nombre: string;
}

export function ImpresionView() {
  const [areas, setAreas] = useState<PrintArea[] | null>(null);
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/admin/print-areas")
      .then((res) => res.json())
      .then((data: { areas: PrintArea[] }) => setAreas(data.areas ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function addArea() {
    if (!nombre.trim()) return;
    setSaving(true);
    await fetch("/api/admin/print-areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombre.trim() }),
    });
    setNombre("");
    setSaving(false);
    load();
  }

  async function removeArea(id: number) {
    await fetch(`/api/admin/print-areas/${id}`, { method: "DELETE" });
    load();
  }

  if (!areas) {
    return <div className="mostrador">Cargando áreas de impresión…</div>;
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Impresión</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14, maxWidth: 480 }}>
        Las comandas que se mandan a cocina (botón "Enviar a cocina") se separan en estas áreas según el
        área asignada a cada producto en <strong>Productos</strong>. Un producto sin área asignada cae en
        Cocina (o Barra si es de la categoría Bebidas), para no perder nada mientras se termina de
        clasificar la carta.
      </p>

      <div className="m-section">
        <div className="m-section-title">Áreas configuradas</div>
        <div className="caja-card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Parrilla, Postres..."
              className="caja-input"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-primary" disabled={saving} onClick={addArea}>
              Agregar
            </button>
          </div>
        </div>

        <table className="m-table">
          <tbody>
            {areas.length === 0 ? (
              <tr>
                <td className="m-empty">Sin áreas todavía.</td>
              </tr>
            ) : (
              areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.nombre}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="btn" onClick={() => removeArea(a.id)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
