"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { LayoutGrid, BarChart3, Receipt, Package, Users, Truck, Monitor, Settings, Wallet } from "lucide-react";
import { OrderPanel } from "@/components/admin/order-panel";
import { MostradorView } from "@/components/admin/mostrador-view";
import { ProductsView } from "@/components/admin/products-view";
import { WebOrdersView } from "@/components/admin/web-orders-view";
import { CajaView } from "@/components/admin/caja-view";
import { money } from "@/lib/admin/format";
import type { AdminStateResponse, Section } from "@/lib/admin/client-types";
import type { PaymentMethod, TableRow, Zone } from "@/lib/admin/types";

const SECTION_TABS: { value: Section; label: string }[] = [
  { value: "mesas", label: "Mesas" },
  { value: "mostrador", label: "Mostrador" },
  { value: "pedidos-web", label: "Pedidos web" },
  { value: "delivery", label: "Delivery" },
  { value: "express", label: "Mostrador express" },
  { value: "reservas", label: "Reservas" },
];

const NAV_ICONS = [
  { Icon: LayoutGrid, title: "Mesas" },
  { Icon: Wallet, title: "Caja" },
  { Icon: BarChart3, title: "Reportes" },
  { Icon: Receipt, title: "Gastos" },
  { Icon: Package, title: "Productos" },
  { Icon: Users, title: "Clientes" },
  { Icon: Truck, title: "Delivery config" },
  { Icon: Monitor, title: "Cocina (KDS)" },
  { Icon: Settings, title: "Configuración" },
];

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

export function AdminApp() {
  const [data, setData] = useState<AdminStateResponse | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [section, setSection] = useState<Section>("mesas");
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

  async function finalizeOrder(method: PaymentMethod, customerId: number | null) {
    if (!selectedOrderId) return;
    const order = data?.openOrders.find((o) => o.id === selectedOrderId);
    if (!order || order.items.length === 0) {
      showToast("El pedido no tiene productos para cobrar");
      return;
    }
    const state = await safeCall(() =>
      postJson("/api/admin/finalize-order", { orderId: selectedOrderId, paymentMethod: method, customerId })
    );
    if (!state) return;
    applyState(state);
    showToast(`Cobrado · ${money(order.total)}`);
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
  const showMainWrap = section === "mesas" || section === "mostrador";

  return (
    <div className="admin-root">
      <div className="topnav">
        <div className="topnav-left">
          <Image
            src="/logo-light.png"
            alt="Madero Restó"
            width={480}
            height={225}
            className="h-9 w-auto"
          />
          <div style={{ display: "flex", gap: 4 }}>
            {NAV_ICONS.map(({ Icon, title }) => {
              const isActive =
                (title === "Mesas" && section === "mesas") ||
                (title === "Productos" && section === "productos") ||
                (title === "Caja" && section === "caja");
              return (
                <div
                  key={title}
                  title={title}
                  onClick={() => {
                    if (title === "Mesas") setSection("mesas");
                    else if (title === "Productos") setSection("productos");
                    else if (title === "Caja") setSection("caja");
                    else showToast(`${title}: lo sumamos en el próximo paso`);
                  }}
                  style={{
                    width: 34,
                    height: 34,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 9,
                    cursor: "pointer",
                    color: isActive ? "#fff" : "#8a8a86",
                    background: isActive ? "var(--orange)" : "transparent",
                  }}
                >
                  <Icon size={18} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="topnav-right">
          <div className="user-box">
            <div className="u1">MADERO RESTO</div>
            <div className="u2">gestión interna</div>
          </div>
        </div>
      </div>

      <div className="section-tabs">
        {SECTION_TABS.map((tab) => (
          <div
            key={tab.value}
            className={`section-tab ${section === tab.value ? "active" : ""}`}
            onClick={() => setSection(tab.value)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {section === "mesas" && (
        <div className="zone-row">
          <div className="zones">
            <div className={`zone-tab ${zone === "salon" ? "active" : ""}`} onClick={() => setZone("salon")}>
              Salón
            </div>
            <div className={`zone-tab ${zone === "terraza" ? "active" : ""}`} onClick={() => setZone("terraza")}>
              Terraza
            </div>
          </div>
        </div>
      )}

      {showMainWrap ? (
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
                      className={`mesa-circ ${table.status}`}
                      onClick={() => openTable(table)}
                    >
                      {table.number}
                      {order && order.total > 0 && <span className="mesa-badge">{money(order.total)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <MostradorView
              openOrders={data.openOrders}
              closedOrders={data.closedOrders}
              onNewOrder={newCounterOrder}
              onOpenOrder={openExistingOrder}
            />
          )}

          <OrderPanel
            order={currentOrder}
            tableNumber={selectedTableNumber}
            catalog={data.catalog}
            activeCategory={activeCategory}
            onChangeCategory={setActiveCategory}
            onAddProduct={addProduct}
            onChangeQty={changeQty}
            onClose={closePanel}
            onSendKitchen={sendKitchen}
            onRequestBill={requestBill}
            onFinalize={finalizeOrder}
          />
        </div>
      ) : section === "productos" ? (
        <ProductsView />
      ) : section === "pedidos-web" ? (
        <WebOrdersView />
      ) : section === "caja" ? (
        <CajaView />
      ) : (
        <div className="placeholder-view">
          <div className="pv-title">
            {section === "delivery" && "Delivery"}
            {section === "express" && "Mostrador express"}
            {section === "reservas" && "Reservas"}
          </div>
          <div className="pv-sub">Este módulo lo construimos en el próximo paso.</div>
        </div>
      )}

      {toastMsg && (
        <div className="toast-wrap">
          <div className="toast">{toastMsg}</div>
        </div>
      )}
    </div>
  );
}
