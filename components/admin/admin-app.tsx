"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { SalesDayView } from "@/components/admin/sales-day-view";
import { ReservationsView } from "@/components/admin/reservations-view";
import { ExpensesView } from "@/components/admin/expenses-view";
import { ClientesView } from "@/components/admin/clientes-view";
import { FidelidadView } from "@/components/admin/fidelidad-view";
import { ImpresionView } from "@/components/admin/impresion-view";
import { ConfiguracionView } from "@/components/admin/configuracion-view";
import { UsuariosView } from "@/components/admin/usuarios-view";
import { AuditoriaView } from "@/components/admin/auditoria-view";
import { IngredientesView } from "@/components/admin/ingredientes-view";
import { ComprasView } from "@/components/admin/compras-view";
import { TableOpenModal } from "@/components/admin/table-open-modal";
import { money, openedSince } from "@/lib/admin/format";
import { printOrderDocument } from "@/lib/print-client";
import { playBeep } from "@/lib/admin/beep";
import { changeCents, fromCents, toCents } from "@/lib/admin/payments";
import type { NewOrderInput } from "@/components/admin/mostrador-view";
import { orderTitle } from "@/lib/admin/order-labels";
import type { AdminStateResponse, Section } from "@/lib/admin/client-types";
import type { Catalog, Order, OrderPayment, TableRow, Zone } from "@/lib/admin/types";

// Venta de barra común (la del Mostrador Express): sin mesa, sin delivery y sin ser pedido web ni de WhatsApp.
function isBarra(o: Order) {
  return !o.tableNumber && !o.isDelivery && (o.channel ?? "mostrador") === "mostrador";
}

const MESA_STATUS_LABEL: Record<TableRow["status"], string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  atencion: "Pidió cuenta",
  cobrando: "Cobrando",
};

// Si la sesión venció o no existe (por ejemplo, la cookie quedó de cuando esta PC
// usaba otra base de datos), se vuelve al login en vez de romper la pantalla.
function goToLogin() {
  window.location.href = "/admin/login";
}

async function readJson(res: Response) {
  if (res.status === 401) {
    goToLogin();
    throw new Error("La sesión venció. Volvé a entrar con tu PIN.");
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error inesperado");
  return data;
}

// Mensaje del sello en el aviso de "Cobrado" (lo que respondió el servidor, no lo que se pidió).
function loyaltyNote(loyalty: { awarded: boolean; reason?: string } | null | undefined) {
  if (!loyalty) return null;
  if (loyalty.awarded) return "+1 sello de fidelidad";
  if (loyalty.reason === "daily_cap") return "Sin sello: ese teléfono ya sumó su sello de hoy";
  return null;
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return readJson(res);
}

async function patchJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return readJson(res);
}

export function AdminApp() {
  const [data, setData] = useState<AdminStateResponse | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("inicio");
  const [zone, setZone] = useState<Zone>("salon");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingTable, setPendingTable] = useState<TableRow | null>(null);
  const [openingTable, setOpeningTable] = useState(false);
  const [editingTable, setEditingTable] = useState(false);
  // Pedidos web pendientes (para el aviso y el contador del menú lateral, en cualquier pantalla).
  const [pendingWeb, setPendingWeb] = useState(0);
  const [webAlert, setWebAlert] = useState<string | null>(null);
  const seenWebIds = useRef<Set<string> | null>(null);
  const sectionRef = useRef<Section>("inicio");
  // Cada cambio hecho desde esta pantalla sube la versión: así una actualización automática
  // que salió antes de ese cambio no lo pisa con datos viejos.
  const stateVersion = useRef(0);
  const busy = useRef(0);

  useEffect(() => {
    sectionRef.current = section;
    if (section === "pedidos-web") setWebAlert(null);
  }, [section]);

  useEffect(() => {
    fetch("/api/admin/state")
      .then(async (res) => {
        if (res.status === 401) {
          goToLogin();
          return null;
        }
        return (await res.json()) as AdminStateResponse & { notConfigured?: boolean; error?: string };
      })
      .then((state) => {
        if (!state) return;
        if (state.notConfigured) {
          setNotConfigured(true);
          return;
        }
        if (!state.catalog) {
          setLoadError(state.error ?? "No se pudo cargar el panel");
          return;
        }
        setData(state);
        setActiveCategory(Object.keys(state.catalog)[0] ?? "");
      })
      .catch(() => setLoadError("No se pudo conectar con el servidor"));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  }, []);

  function applyState(state: AdminStateResponse) {
    stateVersion.current += 1;
    setData(state);
  }

  async function safeCall<T>(fn: () => Promise<T>) {
    busy.current += 1;
    try {
      return await fn();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Error inesperado");
      return null;
    } finally {
      busy.current -= 1;
    }
  }

  // Actualización automática: cada 5 s (solo con la pestaña visible) trae mesas, pedidos y
  // los pedidos web pendientes, así lo que entra desde el celular o desde otra PC aparece sin
  // refrescar la página. No interrumpe una acción en curso ni pisa un cambio recién hecho.
  useEffect(() => {
    let cancelled = false;
    let running = false;
    async function tick() {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const version = stateVersion.current;
        const [stateRes, webRes] = await Promise.all([
          busy.current === 0 ? fetch("/api/admin/state", { cache: "no-store" }) : Promise.resolve(null),
          fetch("/api/admin/web-orders?status=pendiente", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (stateRes?.status === 401 || webRes.status === 401) {
          goToLogin();
          return;
        }
        if (stateRes?.ok) {
          const state = (await stateRes.json()) as AdminStateResponse;
          if (!cancelled && state?.catalog && busy.current === 0 && version === stateVersion.current) setData(state);
        }
        if (webRes.ok) {
          const { orders = [] } = (await webRes.json()) as { orders?: { id: string; customerName: string }[] };
          if (cancelled) return;
          setPendingWeb(orders.length);
          const seen = seenWebIds.current;
          const fresh = seen ? orders.find((o) => !seen.has(o.id)) : undefined;
          // La pantalla "Pedidos web" ya avisa con su propio sonido.
          if (fresh && sectionRef.current !== "pedidos-web") {
            playBeep();
            setWebAlert(`Nuevo pedido web de ${fresh.customerName}`);
          }
          seenWebIds.current = new Set(orders.map((o) => o.id));
        }
      } catch {
        // Sin conexión por un momento: se reintenta en el próximo ciclo.
      } finally {
        running = false;
      }
    }
    tick();
    const interval = setInterval(tick, 5000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function openTable(table: TableRow) {
    if (table.orderId) {
      setSelectedOrderId(table.orderId);
      setSelectedTableNumber(table.number);
      return;
    }
    setPendingTable(table);
  }

  async function confirmOpenTable(details: {
    partySize: number;
    customerName: string;
    waiter: string;
    notes: string;
  }) {
    if (!pendingTable) return;
    setOpeningTable(true);
    const state = await safeCall(() =>
      postJson("/api/admin/open-table", {
        tableNumber: pendingTable.number,
        partySize: details.partySize,
        customerName: details.customerName,
        waiter: details.waiter,
        notes: details.notes,
      })
    );
    setOpeningTable(false);
    if (!state) return;
    applyState(state);
    setSelectedOrderId(state.result.id);
    setSelectedTableNumber(pendingTable.number);
    setPendingTable(null);
  }

  async function confirmEditTable(details: { partySize: number; customerName: string; waiter: string }) {
    if (!selectedOrderId) return;
    setOpeningTable(true);
    const state = await safeCall(() =>
      postJson("/api/admin/table-details", {
        orderId: selectedOrderId,
        partySize: details.partySize,
        customerName: details.customerName,
        waiter: details.waiter,
      })
    );
    setOpeningTable(false);
    if (!state) return;
    applyState(state);
    setEditingTable(false);
    showToast("Mesa actualizada");
  }

  function closePanel() {
    setSelectedOrderId(null);
    setSelectedTableNumber(null);
  }

  async function addProduct(productId: number) {
    if (!selectedOrderId) return;
    const state = await safeCall(() =>
      postJson("/api/admin/add-item", { orderId: selectedOrderId, productId })
    );
    if (state) applyState(state);
  }

  // Cambia el pedido en pantalla al instante (sin esperar al servidor, que con la base en
  // la nube tarda): si el servidor lo rechaza (por ejemplo, sin stock) se vuelve a lo real.
  function patchOrderLocally(orderId: string, update: (order: Order) => Order) {
    stateVersion.current += 1; // que una actualización automática vieja no lo pise
    setData((prev) =>
      prev ? { ...prev, openOrders: prev.openOrders.map((o) => (o.id === orderId ? update(o) : o)) } : prev
    );
  }
  const withTotal = (order: Order): Order => ({
    ...order,
    total: order.items.reduce((sum, it) => sum + it.price * it.qty, 0) + (order.isDelivery ? order.shippingCost : 0),
  });

  async function reloadState() {
    try {
      const res = await fetch("/api/admin/state", { cache: "no-store" });
      if (res.ok) applyState((await res.json()) as AdminStateResponse);
    } catch {
      // la actualización automática lo corrige en unos segundos
    }
  }

  // Varios toques seguidos en +/−: cada uno va al servidor, pero la pantalla solo toma la
  // respuesta del último (las anteriores ya están reflejadas y podrían llegar desordenadas).
  const qtyPending = useRef(0);
  async function changeQty(itemId: string, delta: number) {
    if (!selectedOrderId || delta === 0) return;
    const orderId = selectedOrderId;
    patchOrderLocally(orderId, (o) =>
      withTotal({
        ...o,
        items: o.items.map((it) => (it.id === itemId ? { ...it, qty: it.qty + delta } : it)).filter((it) => it.qty > 0),
      })
    );
    qtyPending.current += 1;
    const state = await safeCall(() => postJson("/api/admin/set-qty", { orderId, itemId, delta }));
    qtyPending.current -= 1;
    if (qtyPending.current > 0) return;
    if (state) applyState(state);
    else reloadState(); // falló (sin stock, sin conexión…): se muestra lo que quedó guardado
  }

  async function changeShipping(cost: number) {
    if (!selectedOrderId) return;
    const orderId = selectedOrderId;
    patchOrderLocally(orderId, (o) => withTotal({ ...o, shippingCost: cost }));
    const state = await safeCall(() => postJson("/api/admin/set-shipping", { orderId, shippingCost: cost }));
    if (state) applyState(state);
    else reloadState();
  }

  async function sendKitchen() {
    if (!selectedOrderId) return;
    const order = data?.openOrders.find((o) => o.id === selectedOrderId);
    if (!order || order.items.length === 0) {
      showToast("Agregá productos antes de enviar");
      return;
    }
    const orderId = selectedOrderId;
    const state = await safeCall(() => postJson("/api/admin/send-kitchen", { orderId }));
    if (!state) return;
    applyState(state);
    showToast("Comanda enviada a cocina");
    try {
      await printOrderDocument("comanda", orderId);
    } catch {
      showToast("No se pudo imprimir la comanda");
    }
  }

  async function printTicket(orderId: string) {
    try {
      await printOrderDocument("ticket", orderId);
    } catch {
      showToast("No se pudo imprimir el ticket");
    }
  }

  async function changeNotes(notes: string) {
    if (!selectedOrderId) return;
    const state = await safeCall(() => postJson("/api/admin/set-notes", { orderId: selectedOrderId, notes }));
    if (state) applyState(state);
  }

  async function changeItemNote(itemId: string, note: string) {
    if (!selectedOrderId) return;
    const state = await safeCall(() =>
      postJson("/api/admin/set-item-note", { orderId: selectedOrderId, itemId, note })
    );
    if (state) applyState(state);
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

  async function finalizeOrder(payments: OrderPayment[], customerId: number | null, loyaltyPhone: string | null) {
    if (!selectedOrderId) return;
    const orderId = selectedOrderId;
    const order = data?.openOrders.find((o) => o.id === orderId);
    if (!order || order.items.length === 0) {
      showToast("El pedido no tiene productos para cobrar");
      return;
    }
    const state = await safeCall(() =>
      postJson("/api/admin/finalize-order", {
        orderId,
        payments,
        customerId,
        loyaltyPhone,
      })
    );
    if (!state) return;
    applyState(state);
    printTicket(orderId);
    const changeToGive = payments.reduce(
      (sum, p) => sum + (p.received != null ? changeCents(toCents(p.amount), toCents(p.received)) : 0),
      0
    );
    showToast(
      [
        `Cobrado · ${money(order.total)}`,
        changeToGive > 0 ? `Vuelto ${money(fromCents(changeToGive))}` : null,
        loyaltyNote(state.result?.loyalty),
      ]
        .filter(Boolean)
        .join(" · ")
    );
    closePanel();
  }

  async function newCounterOrder(
    channel: "mostrador" | "whatsapp" = "mostrador",
    customer?: { name: string; phone: string }
  ) {
    const state = await safeCall(() =>
      postJson("/api/admin/counter-order", {
        channel,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
      })
    );
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
    channel?: "mostrador" | "whatsapp";
  }) {
    const state = await safeCall(() => postJson("/api/admin/delivery-order", customer));
    if (!state) return;
    applyState(state);
    setSelectedOrderId(state.result.id);
    setSelectedTableNumber(null);
  }

  // Abre en el panel (Delivery o Mostrador) el pedido real de un pedido web
  // aceptado, para marcarlo en camino/entregado, cobrarlo y cerrarlo.
  async function openWebOrder(webOrderId: string) {
    const state = await safeCall(() => postJson(`/api/admin/web-orders/${webOrderId}/order`));
    if (!state) return;
    applyState(state);
    const order = (state.openOrders as Order[]).find((o) => o.id === state.result.orderId);
    if (!order) {
      showToast("Este pedido ya fue cobrado");
      return;
    }
    // Todo lo que no es de mesa (web, WhatsApp, delivery, barra) se atiende desde Mostrador.
    setSection("mostrador");
    setSelectedOrderId(order.id);
    setSelectedTableNumber(null);
  }

  // "Nuevo pedido" de Mostrador: retira (pedido común) o delivery (con su zona), en el canal elegido.
  async function createMostradorOrder(input: NewOrderInput) {
    if (input.delivery) {
      await newDeliveryOrder({
        name: input.name,
        phone: "",
        address: input.address,
        zone: input.zone,
        shippingCost: 0,
        channel: input.channel,
      });
    } else {
      await newCounterOrder(input.channel, { name: input.name, phone: "" });
    }
  }

  async function changeDeliveryStatus(status: "preparando" | "en_camino" | "entregado") {
    if (!selectedOrderId) return;
    const state = await safeCall(() => patchJson(`/api/admin/delivery-order/${selectedOrderId}`, { status }));
    if (state) applyState(state);
  }

  if (loadError) {
    return (
      <div className="admin-root">
        <div className="placeholder-view">
          <div className="pv-title">No se pudo abrir el panel</div>
          <div className="pv-sub">{loadError}. Actualizá la página; si sigue igual, revisá la conexión a internet.</div>
        </div>
      </div>
    );
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
      <Sidebar
        activeSection={section}
        onNavigate={setSection}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        badges={{ "pedidos-web": pendingWeb }}
      />

      <div className="admin-main">
        <AdminHeader section={section} onOpenMenu={() => setSidebarOpen(true)} />

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
                      {order && (
                        <span className="mesa-info">
                          {order.customerName && <span className="mesa-info-name">{order.customerName}</span>}
                          {(order.partySize || order.waiter) && (
                            <span>
                              {order.partySize ? `👥 ${order.partySize}` : ""}
                              {order.partySize && order.waiter ? " · " : ""}
                              {order.waiter ?? ""}
                            </span>
                          )}
                          <span>🕒 {openedSince(order.openedAt)}</span>
                        </span>
                      )}
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
              openOrders={data.openOrders.filter((o) => isBarra(o))}
              closedOrders={data.closedOrders.filter((o) => isBarra(o))}
              onNewOrder={() => newCounterOrder("mostrador")}
              onOpenOrder={openExistingOrder}
              title="Mostrador Express"
              newLabel="+ Venta rápida"
              simple
            />
          ) : (
            <MostradorView
              openOrders={data.openOrders.filter((o) => !o.tableNumber)}
              closedOrders={data.closedOrders.filter((o) => !o.tableNumber)}
              onNewOrder={createMostradorOrder}
              onOpenOrder={openExistingOrder}
            />
          )}

          <OrderPanel
            order={currentOrder}
            tableNumber={selectedTableNumber}
            titleOverride={currentOrder ? orderTitle(currentOrder) : null}
            catalog={section === "express" ? expressCatalog : data.catalog}
            activeCategory={section === "express" ? "Todos" : activeCategory}
            onChangeCategory={setActiveCategory}
            onAddProduct={addProduct}
            onChangeQty={changeQty}
            onChangeShipping={changeShipping}
            onClose={closePanel}
            onSendKitchen={sendKitchen}
            onRequestBill={requestBill}
            onFinalize={finalizeOrder}
            onChangeDeliveryStatus={currentOrder?.isDelivery ? changeDeliveryStatus : undefined}
            onChangeNotes={changeNotes}
            onChangeItemNote={changeItemNote}
            onPrintTicket={() => currentOrder && printTicket(currentOrder.id)}
            onEditTable={() => setEditingTable(true)}
          />
        </div>
      ) : section === "productos" ? (
        <ProductsView />
      ) : section === "pedidos-web" ? (
        <WebOrdersView onOpenOrder={openWebOrder} />
      ) : section === "caja" ? (
        <CajaView />
      ) : section === "reportes" ? (
        <ReportsView />
      ) : section === "ventas" ? (
        <SalesDayView />
      ) : section === "reservas" ? (
        <ReservationsView tables={data.tables} />
      ) : section === "gastos" ? (
        <ExpensesView />
      ) : section === "clientes" ? (
        <ClientesView />
      ) : section === "fidelidad" ? (
        <FidelidadView />
      ) : section === "impresion" ? (
        <ImpresionView />
      ) : section === "configuracion" ? (
        <ConfiguracionView onGoTo={setSection} />
      ) : section === "usuarios" ? (
        <UsuariosView />
      ) : section === "auditoria" ? (
        <AuditoriaView />
      ) : section === "ingredientes" ? (
        <IngredientesView />
      ) : section === "compras" ? (
        <ComprasView />
      ) : null}
      </div>

      {webAlert && (
        <div
          style={{ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", zIndex: 75, display: "flex", gap: 10, alignItems: "center", background: "#2c2c2a", color: "#fff", padding: "12px 16px", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}
        >
          <span>🔔 {webAlert}</span>
          <button type="button" className="btn btn-primary" style={{ flex: "none", padding: "6px 12px" }} onClick={() => { setWebAlert(null); setSection("pedidos-web"); }}>
            Ver
          </button>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setWebAlert(null)} style={{ background: "transparent", border: 0, color: "#bbb", cursor: "pointer", fontSize: 16 }}>
            ✕
          </button>
        </div>
      )}

      {toastMsg && (
        <div className="toast-wrap">
          <div className="toast">{toastMsg}</div>
        </div>
      )}

      {editingTable && currentOrder && selectedTableNumber && (
        <TableOpenModal
          mode="edit"
          tableNumber={selectedTableNumber}
          busy={openingTable}
          initial={{ partySize: currentOrder.partySize, customerName: currentOrder.customerName, waiter: currentOrder.waiter }}
          onCancel={() => setEditingTable(false)}
          onConfirm={confirmEditTable}
        />
      )}

      {pendingTable && (
        <TableOpenModal
          tableNumber={pendingTable.number}
          busy={openingTable}
          onCancel={() => setPendingTable(null)}
          onConfirm={confirmOpenTable}
        />
      )}
    </div>
  );
}
