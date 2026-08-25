"use client";

import { money } from "@/lib/gestion/format";
import type { Order } from "@/lib/gestion/types";

interface MostradorViewProps {
  openOrders: Order[];
  closedOrders: Order[];
  onNewOrder: () => void;
  onOpenOrder: (orderId: string) => void;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MostradorView({ openOrders, closedOrders, onNewOrder, onOpenOrder }: MostradorViewProps) {
  const enCurso = openOrders.filter((order) => order.items.length > 0);

  return (
    <div className="mostrador">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h1>Mostrador</h1>
        <button type="button" className="m-new-btn" onClick={onNewOrder}>
          + Nuevo pedido
        </button>
      </div>

      <div className="m-section">
        <div className="m-section-title">En curso</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>Origen</th>
              <th>Hora inicio</th>
              <th>Estado</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {enCurso.length === 0 ? (
              <tr>
                <td colSpan={4} className="m-empty">
                  Sin ventas en curso.
                </td>
              </tr>
            ) : (
              enCurso.map((order) => (
                <tr
                  key={order.id}
                  className="m-row-strip encurso"
                  style={{ cursor: "pointer" }}
                  onClick={() => onOpenOrder(order.id)}
                >
                  <td>{order.tableNumber ? `Mesa ${order.tableNumber}` : "Mostrador"}</td>
                  <td>{formatTime(order.openedAt)}</td>
                  <td>
                    <span className="pill encurso">En curso</span>
                  </td>
                  <td className="m-total">{money(order.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="m-section">
        <div className="m-section-title">Cerradas (últimas 5)</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>Origen</th>
              <th>Fecha y hora</th>
              <th>Estado</th>
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {closedOrders.length === 0 ? (
              <tr>
                <td colSpan={4} className="m-empty">
                  Todavía no hay ventas cerradas.
                </td>
              </tr>
            ) : (
              closedOrders.map((order) => (
                <tr key={order.id} className="m-row-strip cerrada">
                  <td>{order.tableNumber ? `Mesa ${order.tableNumber}` : "Mostrador"}</td>
                  <td>{formatDateTime(order.closedAt ?? order.openedAt)}</td>
                  <td>
                    <span className="pill cerrada">Cerrada</span>
                  </td>
                  <td className="m-total">{money(order.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
