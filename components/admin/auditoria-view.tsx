"use client";

import { useEffect, useState } from "react";

interface AuditEntry {
  id: number;
  userName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  login: "Inicio de sesión",
  logout: "Cierre de sesión",
  create_user: "Alta de usuario",
  update_user: "Edición de usuario",
  price_change: "Cambio de precio",
  stock_adjust: "Ajuste de stock",
  config_change: "Cambio de configuración",
  expense: "Gasto registrado",
  shift_open: "Apertura de caja",
  shift_close: "Cierre de caja",
  order_close: "Pedido cobrado",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" });
}

export function AuditoriaView() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    fetch("/api/admin/audit-log").then(async (res) => {
      if (res.status === 401) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    });
  }, []);

  if (forbidden) {
    return (
      <div className="mostrador">
        <h1 style={{ marginBottom: 6 }}>Auditoría</h1>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
          Solo un administrador puede ver el registro de auditoría.
        </p>
      </div>
    );
  }

  if (!entries) {
    return <div className="mostrador">Cargando auditoría…</div>;
  }

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Auditoría</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 20, maxWidth: 560 }}>
        Últimas {entries.length} acciones sensibles: quién hizo qué, sobre qué, y cuándo. Útil para
        responder "quién cambió este precio" o "quién hizo este retiro" sin tener que adivinar.
      </p>

      <table className="m-table">
        <thead>
          <tr>
            <th>Cuándo</th>
            <th>Quién</th>
            <th>Acción</th>
            <th>Entidad</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={5} className="m-empty">
                Todavía no hay acciones registradas.
              </td>
            </tr>
          ) : (
            entries.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmt(e.createdAt)}</td>
                <td>{e.userName ?? "—"}</td>
                <td>{ACTION_LABEL[e.action] ?? e.action}</td>
                <td style={{ fontSize: 12 }}>
                  {e.entity ?? "—"}
                  {e.entityId ? ` #${e.entityId}` : ""}
                </td>
                <td style={{ fontSize: 11.5, color: "var(--text-dim)", maxWidth: 320 }}>
                  {e.oldValue && <div>antes: {e.oldValue}</div>}
                  {e.newValue && <div>después: {e.newValue}</div>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
