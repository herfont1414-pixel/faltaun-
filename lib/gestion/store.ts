import catalog from "@/data/catalogo_productos.json";
import type { Catalog, Order, OrderItem, OrderWithTotal, TableRow, Zone } from "@/lib/gestion/types";

const TYPED_CATALOG = catalog as Catalog;

function createTables(): TableRow[] {
  const tables: TableRow[] = [];
  for (let n = 1; n <= 35; n++) {
    tables.push({ number: n, zone: "salon", status: "libre", orderId: null });
  }
  for (let n = 36; n <= 45; n++) {
    tables.push({ number: n, zone: "terraza", status: "libre", orderId: null });
  }
  return tables;
}

interface Store {
  tables: TableRow[];
  orders: Map<string, Order>;
}

const globalForGestion = globalThis as unknown as { __gestionStore?: Store };

const store: Store =
  globalForGestion.__gestionStore ??
  (globalForGestion.__gestionStore = {
    tables: createTables(),
    orders: new Map(),
  });

function newId() {
  return crypto.randomUUID();
}

function orderTotal(order: Order) {
  return order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function findTable(number: number) {
  const table = store.tables.find((t) => t.number === number);
  if (!table) throw new Error(`Mesa ${number} no existe`);
  return table;
}

function findOrder(orderId: string) {
  const order = store.orders.get(orderId);
  if (!order) throw new Error(`Pedido ${orderId} no existe`);
  return order;
}

export function getCatalog(): Catalog {
  return TYPED_CATALOG;
}

export function getState() {
  const openOrders = [...store.orders.values()].filter((o) => o.status === "abierta");
  const closedOrders = [...store.orders.values()]
    .filter((o) => o.status === "cerrada")
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
    .slice(0, 5);

  return {
    catalog: TYPED_CATALOG,
    tables: store.tables,
    openOrders: openOrders.map(withTotal),
    closedOrders: closedOrders.map(withTotal),
  };
}

function withTotal(order: Order): OrderWithTotal {
  return { ...order, total: orderTotal(order) };
}

export function openTable(tableNumber: number) {
  const table = findTable(tableNumber);
  if (table.orderId) return findOrder(table.orderId);

  const order: Order = {
    id: newId(),
    origin: "mesa",
    tableNumber,
    status: "abierta",
    customerName: null,
    openedAt: Date.now(),
    closedAt: null,
    items: [],
  };
  store.orders.set(order.id, order);
  table.orderId = order.id;
  table.status = "ocupada";
  return order;
}

export function addItem(orderId: string, product: { name: string; price: number }) {
  const order = findOrder(orderId);
  const existing = order.items.find((it) => it.name === product.name);
  if (existing) {
    existing.qty += 1;
  } else {
    const item: OrderItem = {
      id: newId(),
      name: product.name,
      price: product.price,
      qty: 1,
      sentToKitchen: false,
    };
    order.items.push(item);
  }
  return order;
}

export function setQty(orderId: string, itemId: string, delta: number) {
  const order = findOrder(orderId);
  const item = order.items.find((it) => it.id === itemId);
  if (!item) return order;
  item.qty += delta;
  if (item.qty <= 0) {
    order.items = order.items.filter((it) => it.id !== itemId);
  }
  return order;
}

export function sendToKitchen(orderId: string) {
  const order = findOrder(orderId);
  order.items.forEach((item) => {
    item.sentToKitchen = true;
  });
  return order;
}

export function requestBill(tableNumber: number) {
  const table = findTable(tableNumber);
  table.status = "atencion";
  return table;
}

export function charge(tableNumber: number) {
  const table = findTable(tableNumber);
  table.status = "cobrando";
  return table;
}

export function freeTable(tableNumber: number) {
  const table = findTable(tableNumber);
  if (table.orderId) {
    const order = findOrder(table.orderId);
    order.status = "cerrada";
    order.closedAt = Date.now();
  }
  table.status = "libre";
  table.orderId = null;
  return table;
}

export function createCounterOrder() {
  const order: Order = {
    id: newId(),
    origin: "mostrador",
    tableNumber: null,
    status: "abierta",
    customerName: null,
    openedAt: Date.now(),
    closedAt: null,
    items: [],
  };
  store.orders.set(order.id, order);
  return order;
}

export function closeOrder(orderId: string) {
  const order = findOrder(orderId);
  order.status = "cerrada";
  order.closedAt = Date.now();
  return order;
}

export function zoneTables(zone: Zone) {
  return store.tables.filter((t) => t.zone === zone);
}
