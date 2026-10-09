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
  note: string | null;
}

export type DeliveryStatus = "preparando" | "en_camino" | "entregado";

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
  isDelivery: boolean;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  deliveryZone: string | null;
  shippingCost: number;
  deliveryPerson: string | null;
  deliveryStatus: DeliveryStatus | null;
  notes: string | null;
  partySize: number | null;
  waiter: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
}

export interface OrderPayment {
  method: PaymentMethod;
  // Importe aplicado a la venta (lo que cuenta la caja).
  amount: number;
  // Solo efectivo: lo que entregó el cliente. El vuelto sale de acá menos amount.
  received?: number | null;
}

export interface DeliveryZone {
  id: number;
  name: string;
  cost: number;
  // Con valor es una zona "por distancia" (hasta N km del local); null es una zona por nombre.
  maxKm: number | null;
}

export interface DeliveryCustomer {
  phone: string;
  name: string;
  address: string | null;
  updatedAt: string;
}

export interface TableRow {
  number: number;
  zone: Zone;
  status: TableStatus;
  orderId: string | null;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  inStock: boolean;
}

export type Catalog = Record<string, Product[]>;

export type WebOrderStatus = "pendiente" | "confirmado" | "rechazado";
export type Fulfillment = "retiro" | "delivery";

export interface WebOrderItem {
  name: string;
  price: number;
  qty: number;
}

// Medios que ofrece el menú online (el link de pago no se usa).
export type WebPaymentMethod = "efectivo" | "transferencia";

export interface WebOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  fulfillment: Fulfillment;
  deliveryZone: string | null;
  shippingCost: number;
  notes: string | null;
  items: WebOrderItem[];
  total: number;
  status: WebOrderStatus;
  etaMinutes: number | null;
  createdAt: string;
  // Pedido real (cobrable) que se creó al aceptarlo; null si todavía no existe.
  orderId: string | null;
  // Estado del pedido real vinculado ('abierta' | 'cerrada'); null si no hay.
  orderStatus: "abierta" | "cerrada" | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  // Cómo dijo el cliente que va a pagar; null en pedidos anteriores a esta opción.
  paymentMethod: WebPaymentMethod | null;
}

export interface AdminProduct {
  id: number;
  name: string;
  price: number;
  active: boolean;
  inStock: boolean;
  stockQty: number | null;
  category: string;
  printAreaId: number | null;
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
  expensesEfectivo: number;
  ingresosEfectivo: number;
  retirosEfectivo: number;
  ajustesEfectivo: number;
  notes: string | null;
}

export type ExpensePaymentMethod = "efectivo" | "transferencia";

export interface Expense {
  id: string;
  concept: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  createdAt: string;
}

export type KitchenStatus = "pendiente" | "preparando" | "listo" | "despachado";
export type KitchenSource = "orden" | "web";

export interface KitchenTicket {
  id: string;
  source: KitchenSource;
  origin: OrderOrigin | "web" | "delivery";
  tableNumber: number | null;
  customerName: string | null;
  items: { name: string; qty: number }[];
  kitchenStatus: KitchenStatus;
  sentAt: string;
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

export type PaperWidthMm = 58 | 80;
export type PrintFontSize = "normal" | "pequena";

export interface PrintConfig {
  paperWidthMm: PaperWidthMm;
  headerText: string;
  footerText: string;
  paperSavingMode: boolean;
  fontSizeHeader: PrintFontSize;
  fontSizeBody: PrintFontSize;
  fontSizeFooter: PrintFontSize;
  directPrintEnabled: boolean;
  printerName: string;
}

export interface BusinessConfig {
  name: string;
  address: string;
  hours: string;
  whatsappNumber: string;
  logoUrl: string;
  // Alias (o CBU) y titular a los que el cliente transfiere al hacer el pedido online.
  transferAlias: string;
  transferHolder: string;
}

export interface AfipConfig {
  cuit: string;
  puntoVenta: number | null;
  condicionIva: string;
  habilitado: boolean;
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
  byEmployee: { userName: string; orderCount: number; total: number }[];
  orders: SalesReportOrder[];
  totalExpenses: number;
  netTotal: number;
  costoMercaderiaEstimado: number | null;
  margenBrutoEstimado: number | null;
  resultadoOperativoEstimado: number | null;
}
