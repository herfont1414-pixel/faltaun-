"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { OrderPanel } from "@/components/admin/order-panel";
import { DashboardView } from "@/components/admin/dashboard-view";
import { MostradorView } from "@/components/admin/mostrador-view";
import { DeliveryView } from "@/components/admin/delivery-view";
import { ProductsView } from "@/components/admin/products-view";
import { WebOrdersView } from "@/components/admin/web-orders-view";
import { CajaView } from "@/components/admin/caja-view";
import { ReportsView } from "@/components/admin/reports-view";
import { ReservationsView } from "@/components/admin/reservations-view";
import { ExpensesView } from "@/components/admin/expenses-view";
import { ClientesView } from "@/components/admin/clientes-view";
import { ImpresionView } from "@/components/admin/impresion-view";
import { money } from "@/lib/admin/format";
import type { AdminStateResponse, Section } from "@/lib/admin/client-types";
import type { Catalog, PaymentMethod, TableRow, Zone } from "@/lib/admin/types";

const MESA_STATUS_LABEL: Record<TableRow["status"], string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  atencion: "Pidió cuenta",
  cobrando: "Cobrando",
};

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error inesperado");
  return data;
}

async function patchJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error inesperado");
  return data;
}

export function AdminApp() {
  const [data, setData] = useState<AdminStateResponse | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [section, setSection] = useState<Section>("inicio");
  const [zone, setZone] = useState<Zone>("salon");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/state")
      .then((res) => res.json())
      .then((state: AdminStateResponse & { notConfigured?: boolean }) => {
        if (state.notConfigured) {
          setNotConfigured(true);
          return;
        }
        setData(state);
        setActiveCategory(Object.keys(state.catalog)[0] ?? "");
      });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  }, []);

  function applyState(state: AdminStateResponse) {
    setData(state);
  }

  async function safeCall<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Error inesperado");
      return null;
    }
  }

  async function openTable(table: TableRow) {
    if (table.orderId) {
      setSelectedOrderId(table.orderId);
      setSelectedTableNumber(table.number);
      return;
    }
    const state = await safeCall(() => postJson("/api/admin/open-table", { tableNumber: table.number }));
    if (!state) return;
    applyState(state);
    setSelectedOrderId(state.result.id);
    setSelectedTableNumber(table.number);
  }

  function closePanel() {
    setSelectedOrderId(null);
    setSelectedTableNumber(null);
  }

  async function addProduct(name: string, price: number) {
    if (!selectedOrderId) return;
    const state = await safeCall(() =>
      postJson("/api/admin/add-item", { orderId: selectedOrderId, name, price })
    );
    if (state) applyState(state);
  }

  async function changeQty(itemId: string, delta: number) {
    if (!selectedOrderId) return;
    const state = await safeCall(() =>
      postJson("/api/admin/set-qty", { orderId: selectedOrderId, itemId, delta })
    );
    if (state) applyState(state);
  }

  async function sendKitchen() {
    if (!selectedOrderId) return;
    const order = data?.openOrders.find((o) => o.id === selectedOrderId);
    if (!order || order.items.length === 0) {
      showToast("Agregá productos antes de enviar");
      return;
    }
    const state = await safeCall(() => postJson("/api/admin/send-kitchen", { orderId: selectedOrderId }));
    if (!state) return;
    applyState(state);
    showToast("Comanda enviada a cocina");
    window.open(`/admin/comanda/${selectedOrderId}`, "_blank");
  }

  async function requestBill() {
    if (!selectedTableNumber) return;
    const state = await safeCall(() =>
      postJson("/api/admin/request-bill", { tableNumber: selectedTableNumber })
    );
    if (!state) return;
    applyState(state);
    showToast(`Mesa ${selectedTableNumber} pidió la cuenta`);
  }

  async function finalizeOrder(method: PaymentMethod, customerId: number | null, loyaltyPhone: string | null) {
    if (!selectedOrderId) return;
    const order = data?.openOrders.find((o) => o.id === selectedOrderId);
    if (!order || order.items.length === 0) {
      showToast("El pedido no tiene productos para cobrar");
      return;
    }
    const state = await safeCall(() =>
      postJson("/api/admin/finalize-order", {
        orderId: selectedOrderId,
        paymentMethod: method,
        customerId,
        loyaltyPhone,
      })
    );
    if (!state) return;
    applyState(state);
    showToast(
      loyaltyPhone ? `Cobrado · ${money(order.total)} · +1 sello de fidelidad` : `Cobrado · ${money(order.total)}`
    );
    closePanel();
  }

  async function newCounterOrder() {
    const state = await safeCall(() => postJson("/api/admin/counter-order"));
    if (!state) return;
    applyState(state);
    setSelectedOrderId(state.result.id);
    setSelectedTableNumber(null);
  }

  function openExistingOrder(orderId: string) {
    const order = data?.openOrders.find((o) => o.id === orderId);
    setSelectedOrderId(orderId);
    setSelectedTableNumber(order?.tableNumber ?? null);
  }

  async function newDeliveryOrder(customer: {
    name: string;
    phone: string;
    address: string;
    zone: string | null;
    shippingCost: number;
  }) {
    const state = await safeCall(() => postJson("/api/admin/delivery-order", customer));
    if (!state) return;
    applyState(state);
    setSelectedOrderId(state.result.id);
    setSelectedTableNumber(null);
  }

  async function changeDeliveryStatus(status: "preparando" | "en_camino" | "entregado") {
    if (!selectedOrderId) return;
    const state = await safeCall(() => patchJson(`/api/admin/delivery-order/${selectedOrderId}`, { status }));
    if (state) applyState(state);
  }

  if (notConfigured) {
    return (
      <div className="admin-root">
        <div className="placeholder-view">
          <div className="pv-title">Falta conectar la base de datos</div>
          <div className="pv-sub">
            Configurá la variable de entorno DATABASE_URL y corré `npm run seed:admin` para cargar
            productos, mesas y clientes.
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-root">
        <div className="empty-hint" style={{ width: "100%" }}>
          Cargando…
        </div>
      </div>
    );
  }

  const currentOrder = selectedOrderId
    ? data.openOrders.find((o) => o.id === selectedOrderId) ?? null
    : null;

  const visibleTables = data.tables.filter((t) => t.zone === zone);
  const showMainWrap =
    section === "mesas" || section === "mostrador" || section === "delivery" || section === "express";

  const expressCatalog: Catalog = { Todos: Object.values(data.catalog).flat() };

  return (
    <div className="admin-root">
      <Sidebar activeSection={section} onNavigate={setSection} onToast={showToast} />

      <div className="admin-main">
        <AdminHeader section={section} />

        {section === "mesas" && (
          <div className="zone-row">
            <div className="zones">
              <div className={`zone-tab ${zone === "salon" ? "active" : ""}`} onClick={() => setZone("salon")}>
                Salón
              </div>
              <div
                className={`zone-tab ${zone === "terraza" ? "active" : ""}`}
                onClick={() => setZone("terraza")}
              >
                Terraza
              </div>
            </div>
          </div>
        )}

        {section === "inicio" ? (
        <DashboardView
          tables={data.tables}
          onGoTo={(target) => setSection(target)}
        />
      ) : showMainWrap ? (
        <div className="main-wrap">
          {section === "mesas" ? (
            <div className="floor">
              <div className="mesas-grid">
                {visibleTables.map((table) => {
                  const order = table.orderId
                    ? data.openOrders.find((o) => o.id === table.orderId)
                    : null;
                  return (
                    <div
                      key={table.number}
                      className={`mesa-tile ${table.status}`}
                      onClick={() => openTable(table)}
                    >
                      <span className="mesa-num">{table.number}</span>
                      <span className="mesa-label">{MESA_STATUS_LABEL[table.status]}</span>
                      {order && order.total > 0 && <span className="mesa-badge">{money(order.total)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : section === "delivery" ? (
            <DeliveryView
              openOrders={data.openOrders.filter((o) => o.isDelivery)}
              closedOrders={data.closedOrders.filter((o) => o.isDelivery)}
              onNewOrder={newDeliveryOrder}
              onOpenOrder={openExistingOrder}
            />
          ) : section === "express" ? (
            <MostradorView
              openOrders={data.openOrders.filter((o) => !o.isDelivery)}
              closedOrders={data.closedOrders.filter((o) => !o.isDelivery)}
              onNewOrder={newCounterOrder}
              onOpenOrder={openExistingOrder}
              title="Mostrador Express"
              newLabel="+ Venta rápida"
            />
          ) : (
            <MostradorView
              openOrders={data.openOrders.filter((o) => !o.isDelivery)}
              closedOrders={data.closedOrders.filter((o) => !o.isDelivery)}
              onNewOrder={newCounterOrder}
              onOpenOrder={openExistingOrder}
            />
          )}

          <OrderPanel
            order={currentOrder}
            tableNumber={selectedTableNumber}
            titleOverride={currentOrder?.isDelivery ? `Delivery · ${currentOrder.customerName}` : null}
            catalog={section === "express" ? expressCatalog : data.catalog}
            activeCategory={section === "express" ? "Todos" : activeCategory}
            onChangeCategory={setActiveCategory}
            onAddProduct={addProduct}
            onChangeQty={changeQty}
            onClose={closePanel}
            onSendKitchen={sendKitchen}
            onRequestBill={requestBill}
            onFinalize={finalizeOrder}
            onChangeDeliveryStatus={currentOrder?.isDelivery ? changeDeliveryStatus : undefined}
          />
        </div>
      ) : section === "productos" ? (
        <ProductsView />
      ) : section === "pedidos-web" ? (
        <WebOrdersView />
      ) : section === "caja" ? (
        <CajaView />
      ) : section === "reportes" ? (
        <ReportsView />
      ) : section === "reservas" ? (
        <ReservationsView />
      ) : section === "gastos" ? (
        <ExpensesView />
      ) : section === "clientes" ? (
        <ClientesView />
      ) : section === "impresion" ? (
        <ImpresionView />
      ) : null}
      </div>

      {toastMsg && (
        <div className="toast-wrap">
          <div className="toast">{toastMsg}</div>
        </div>
      )}
    </div>
  );
}
