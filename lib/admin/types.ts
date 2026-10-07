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
  inStock: boolean;
}

export type Catalog = Record<string, Product[]>;

export type WebOrderStatus = "pendiente" | "confirmado" | "rechazado";

export interface WebOrderItem {
  name: string;
  price: number;
  qty: number;
}

export interface WebOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  items: WebOrderItem[];
  total: number;
  status: WebOrderStatus;
  etaMinutes: number | null;
  createdAt: string;
}

export interface AdminProduct {
  id: number;
  name: string;
  price: number;
  active: boolean;
  inStock: boolean;
  category: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  cuentaCorriente: boolean;
}

export interface AdminState {
  catalog: Catalog;
  tables: TableRow[];
  openOrders: Order[];
  closedOrders: Order[];
}

export type ShiftStatus = "abierto" | "cerrado";

export interface Shift {
  id: string;
  status: ShiftStatus;
  openingCash: number;
  openedAt: string;
  closedAt: string | null;
  countedCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  salesEfectivo: number;
  salesTransferencia: number;
  salesCuentaCorriente: number;
  notes: string | null;
}

export interface SalesReportOrder {
  id: string;
  openedAt: string;
  closedAt: string;
  origin: OrderOrigin;
  tableNumber: number | null;
  paymentMethod: PaymentMethod | null;
  customerName: string | null;
  total: number;
}

export type ReservationStatus = "pendiente" | "confirmada" | "rechazada";

export interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  date: string;
  time: string;
  notes: string | null;
  status: ReservationStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface SalesReport {
  from: string;
  to: string;
  totalSales: number;
  orderCount: number;
  avgTicket: number;
  byPaymentMethod: { method: PaymentMethod | "sin_definir"; total: number; count: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
  byCategory: { category: string; revenue: number }[];
  orders: SalesReportOrder[];
}
