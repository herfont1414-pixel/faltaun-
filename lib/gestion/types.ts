export type TableStatus = "libre" | "ocupada" | "atencion" | "cobrando";
export type OrderOrigin = "mesa" | "mostrador";
export type OrderStatus = "abierta" | "cerrada";
export type Zone = "salon" | "terraza";

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  sentToKitchen: boolean;
}

export interface Order {
  id: string;
  origin: OrderOrigin;
  tableNumber: number | null;
  status: OrderStatus;
  customerName: string | null;
  openedAt: number;
  closedAt: number | null;
  items: OrderItem[];
}

export interface TableRow {
  number: number;
  zone: Zone;
  status: TableStatus;
  orderId: string | null;
}

export interface Product {
  name: string;
  price: number;
}

export type Catalog = Record<string, Product[]>;

export type OrderWithTotal = Order & { total: number };

export interface GestionState {
  catalog: Catalog;
  tables: TableRow[];
  openOrders: Order[];
  closedOrders: Order[];
}
