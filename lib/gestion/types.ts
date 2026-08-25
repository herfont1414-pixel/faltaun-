export type TableStatus = "libre" | "ocupada" | "atencion" | "cobrando";
export type OrderOrigin = "mesa" | "mostrador";
export type OrderStatus = "abierta" | "cerrada";
export type Zone = "salon" | "terraza";
export type PaymentMethod = "efectivo" | "transferencia" | "cuenta_corriente";

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
  paymentMethod: PaymentMethod | null;
  customerId: number | null;
  openedAt: string;
  closedAt: string | null;
  items: OrderItem[];
  total: number;
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

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  cuentaCorriente: boolean;
}

export interface GestionState {
  catalog: Catalog;
  tables: TableRow[];
  openOrders: Order[];
  closedOrders: Order[];
}
