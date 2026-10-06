import { getPool } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import type {
  AdminProduct,
  Catalog,
  Customer,
  AdminState,
  Order,
  OrderItem,
  PaymentMethod,
  TableRow,
  Zone,
} from "@/lib/admin/types";

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

async function getCatalog(): Promise<Catalog> {
  const pool = getPool();
  const categories = await pool.query<{ id: number; name: string }>(
    "select id, name from gestion_categories order by sort_order"
  );
  const products = await pool.query<{
    category_id: number;
    name: string;
    price: string;
    in_stock: boolean;
  }>("select category_id, name, price, in_stock from gestion_products where active = true order by id");

  const catalog: Catalog = {};
  for (const cat of categories.rows) catalog[cat.name] = [];
  for (const product of products.rows) {
    const category = categories.rows.find((c) => c.id === product.category_id);
    if (!category) continue;
    catalog[category.name].push({
      name: product.name,
      price: money(product.price),
      inStock: product.in_stock,
    });
  }
  return catalog;
}

async function getTables(): Promise<TableRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    number: number;
    status: TableRow["status"];
    zone: Zone;
    order_id: string | null;
  }>(`
    select t.number, t.status, z.name as zone, o.id as order_id
    from gestion_tables t
    join gestion_zones z on z.id = t.zone_id
    left join gestion_orders o on o.table_id = t.id and o.status = 'abierta'
    order by t.number
  `);
  return rows.map((r) => ({ number: r.number, status: r.status, zone: r.zone, orderId: r.order_id }));
}

async function attachItems(orderRows: any[]): Promise<Order[]> {
  if (orderRows.length === 0) return [];
  const pool = getPool();
  const ids = orderRows.map((r) => r.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const { rows: itemRows } = await pool.query<{
    id: string;
    order_id: string;
    product_name: string;
    price: string;
    qty: number;
    sent_to_kitchen: boolean;
  }>(`select * from gestion_order_items where order_id in (${placeholders}) order by id`, ids);

  return orderRows.map((o) => {
    const items: OrderItem[] = itemRows
      .filter((it) => it.order_id === o.id)
      .map((it) => ({
        id: it.id,
        name: it.product_name,
        price: money(it.price),
        qty: it.qty,
        sentToKitchen: it.sent_to_kitchen,
      }));
    const liveTotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
    return {
      id: o.id,
      origin: o.origin,
      tableNumber: o.table_number,
      status: o.status,
      paymentMethod: o.payment_method,
      customerId: o.customer_id,
      openedAt: o.opened_at,
      closedAt: o.closed_at,
      items,
      total: o.status === "cerrada" ? money(o.total) : liveTotal,
    };
  });
}

export async function getState(): Promise<AdminState> {
  await ensureSeeded();
  const pool = getPool();
  const [catalog, tables, openRows, closedRows] = await Promise.all([
    getCatalog(),
    getTables(),
    pool.query(`
      select o.*, t.number as table_number
      from gestion_orders o
      left join gestion_tables t on t.id = o.table_id
      where o.status = 'abierta'
      order by o.opened_at
    `),
    pool.query(`
      select o.*, t.number as table_number
      from gestion_orders o
      left join gestion_tables t on t.id = o.table_id
      where o.status = 'cerrada'
      order by o.closed_at desc
      limit 5
    `),
  ]);

  const [openOrders, closedOrders] = await Promise.all([
    attachItems(openRows.rows),
    attachItems(closedRows.rows),
  ]);

  return { catalog, tables, openOrders, closedOrders };
}

async function getOrderRow(orderId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `select o.*, t.number as table_number from gestion_orders o
     left join gestion_tables t on t.id = o.table_id
     where o.id = $1`,
    [orderId]
  );
  if (!rows[0]) throw new Error(`Pedido ${orderId} no existe`);
  return rows[0];
}

export async function openTable(tableNumber: number) {
  const pool = getPool();
  const { rows: tableRows } = await pool.query(
    "select id, status from gestion_tables where number = $1",
    [tableNumber]
  );
  if (!tableRows[0]) throw new Error(`Mesa ${tableNumber} no existe`);

  if (tableRows[0].status !== "libre") {
    const { rows } = await pool.query(
      "select id from gestion_orders where table_id = $1 and status = 'abierta'",
      [tableRows[0].id]
    );
    if (rows[0]) return getOrderRow(rows[0].id);
  }

  const { rows: orderRows } = await pool.query(
    "insert into gestion_orders (table_id, origin) values ($1, 'mesa') returning id",
    [tableRows[0].id]
  );
  await pool.query("update gestion_tables set status = 'ocupada' where number = $1", [tableNumber]);
  return getOrderRow(orderRows[0].id);
}

export async function addItem(orderId: string, product: { name: string; price: number }) {
  const pool = getPool();
  const { rows: existing } = await pool.query(
    "select id, qty from gestion_order_items where order_id = $1 and product_name = $2",
    [orderId, product.name]
  );
  if (existing[0]) {
    await pool.query("update gestion_order_items set qty = qty + 1 where id = $1", [existing[0].id]);
  } else {
    await pool.query(
      "insert into gestion_order_items (order_id, product_name, price) values ($1, $2, $3)",
      [orderId, product.name, product.price]
    );
  }
  return getOrderRow(orderId);
}

export async function setQty(orderId: string, itemId: string, delta: number) {
  const pool = getPool();
  const { rows } = await pool.query(
    "update gestion_order_items set qty = qty + $2 where id = $1 and order_id = $3 returning qty",
    [itemId, delta, orderId]
  );
  if (rows[0] && rows[0].qty <= 0) {
    await pool.query("delete from gestion_order_items where id = $1", [itemId]);
  }
  return getOrderRow(orderId);
}

export async function sendToKitchen(orderId: string) {
  const pool = getPool();
  await pool.query("update gestion_order_items set sent_to_kitchen = true where order_id = $1", [
    orderId,
  ]);
  return getOrderRow(orderId);
}

export async function requestBill(tableNumber: number) {
  const pool = getPool();
  await pool.query("update gestion_tables set status = 'atencion' where number = $1", [tableNumber]);
}

export async function finalizeOrder(
  orderId: string,
  paymentMethod: PaymentMethod,
  customerId: number | null
) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows: orderRows } = await client.query(
      `select o.*, t.number as table_number from gestion_orders o
       left join gestion_tables t on t.id = o.table_id
       where o.id = $1 for update of o`,
      [orderId]
    );
    if (!orderRows[0]) throw new Error(`Pedido ${orderId} no existe`);
    const order = orderRows[0];

    const { rows: itemRows } = await client.query(
      "select price, qty from gestion_order_items where order_id = $1",
      [orderId]
    );
    const total = itemRows.reduce((sum, it) => sum + money(it.price) * it.qty, 0);

    if (paymentMethod === "cuenta_corriente") {
      if (!customerId) throw new Error("Elegí un cliente para cobrar a cuenta corriente");
      await client.query("update gestion_customers set balance = balance - $2 where id = $1", [
        customerId,
        total,
      ]);
      await client.query(
        `insert into gestion_customer_ledger (customer_id, amount, type, payment_method, note)
         values ($1, $2, 'Pago de Venta', 'Cta. Cte.', $3)`,
        [customerId, -total, order.table_number ? `Mesa ${order.table_number}` : "Mostrador"]
      );
    }

    await client.query(
      `update gestion_orders
       set status = 'cerrada', closed_at = now(), total = $2, payment_method = $3, customer_id = $4
       where id = $1`,
      [orderId, total, paymentMethod, customerId]
    );

    if (order.table_id) {
      await client.query("update gestion_tables set status = 'libre' where id = $1", [order.table_id]);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function createCounterOrder() {
  const pool = getPool();
  const { rows } = await pool.query(
    "insert into gestion_orders (origin) values ('mostrador') returning id"
  );
  return getOrderRow(rows[0].id);
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select id, name, phone, balance, cuenta_corriente
     from gestion_customers
     where active = true and cuenta_corriente = true and name ilike $1
     order by name
     limit 20`,
    [`%${query}%`]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    balance: money(r.balance),
    cuentaCorriente: r.cuenta_corriente,
  }));
}

export async function listAllProducts(): Promise<AdminProduct[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    name: string;
    price: string;
    active: boolean;
    in_stock: boolean;
    category_name: string;
    sort_order: number;
  }>(`
    select p.id, p.name, p.price, p.active, p.in_stock, c.name as category_name, c.sort_order
    from gestion_products p
    join gestion_categories c on c.id = p.category_id
    order by c.sort_order, p.name
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: money(r.price),
    active: r.active,
    inStock: r.in_stock,
    category: r.category_name,
  }));
}

export async function updateProduct(
  id: number,
  changes: { price?: number; active?: boolean; inStock?: boolean }
) {
  const pool = getPool();
  if (changes.price !== undefined) {
    await pool.query("update gestion_products set price = $2 where id = $1", [id, changes.price]);
  }
  if (changes.active !== undefined) {
    await pool.query("update gestion_products set active = $2 where id = $1", [id, changes.active]);
  }
  if (changes.inStock !== undefined) {
    await pool.query("update gestion_products set in_stock = $2 where id = $1", [id, changes.inStock]);
  }
}
