create table if not exists gestion_categories (
  id integer primary key autoincrement,
  name text unique not null,
  sort_order int not null default 0
);

create table if not exists gestion_products (
  id integer primary key autoincrement,
  category_id int references gestion_categories(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null,
  active boolean not null default true,
  in_stock boolean not null default true,
  stock_qty int,
  unique (category_id, name)
);

create table if not exists gestion_customers (
  id integer primary key autoincrement,
  external_id int unique,
  name text not null,
  phone text,
  balance numeric(12, 2) not null default 0,
  cuenta_corriente boolean not null default false,
  active boolean not null default true
);

create table if not exists gestion_customer_ledger (
  id integer primary key autoincrement,
  external_id int unique,
  customer_id int references gestion_customers(id) on delete cascade,
  occurred_at text not null default (now()),
  amount numeric(12, 2) not null,
  type text,
  payment_method text,
  note text
);

create table if not exists gestion_zones (
  id integer primary key autoincrement,
  name text unique not null,
  sort_order int not null default 0
);

create table if not exists gestion_tables (
  id integer primary key autoincrement,
  zone_id int references gestion_zones(id) on delete cascade,
  number int unique not null,
  status text not null default 'libre' check (status in ('libre', 'ocupada', 'atencion', 'cobrando'))
);

create table if not exists gestion_orders (
  id text primary key default (gen_random_uuid()),
  table_id int references gestion_tables(id),
  origin text not null default 'mesa' check (origin in ('mesa', 'mostrador')),
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  payment_method text check (payment_method in ('efectivo', 'transferencia', 'cuenta_corriente')),
  customer_id int references gestion_customers(id),
  opened_at text not null default (now()),
  closed_at text,
  total numeric(12, 2) not null default 0,
  kitchen_status text check (kitchen_status in ('pendiente', 'preparando', 'listo', 'despachado')),
  kitchen_sent_at text,
  is_delivery boolean not null default false,
  customer_name text,
  customer_phone text,
  customer_address text,
  delivery_zone text,
  shipping_cost numeric(10, 2) not null default 0,
  delivery_person text,
  delivery_status text check (delivery_status in ('preparando', 'en_camino', 'entregado')),
  notes text,
  party_size int,
  waiter text
);

create table if not exists gestion_order_items (
  id text primary key default (gen_random_uuid()),
  order_id text references gestion_orders(id) on delete cascade,
  product_name text not null,
  price numeric(10, 2) not null,
  qty int not null default 1,
  sent_to_kitchen boolean not null default false,
  note text,
  product_id int references gestion_products(id) on delete set null
);

create table if not exists gestion_order_payments (
  id text primary key default (gen_random_uuid()),
  order_id text references gestion_orders(id) on delete cascade,
  method text not null check (method in ('efectivo', 'transferencia', 'cuenta_corriente')),
  amount numeric(12, 2) not null,
  created_at text not null default (now())
);

insert into gestion_order_payments (order_id, method, amount)
select o.id, o.payment_method, o.total
from gestion_orders o
where o.status = 'cerrada' and o.payment_method is not null
  and not exists (select 1 from gestion_order_payments gop where gop.order_id = o.id);

create index if not exists gestion_order_payments_order_id_idx on gestion_order_payments(order_id);
create index if not exists gestion_order_items_order_id_idx on gestion_order_items(order_id);
create index if not exists gestion_orders_status_idx on gestion_orders(status);
create index if not exists gestion_customer_ledger_customer_id_idx on gestion_customer_ledger(customer_id);

create table if not exists gestion_web_orders (
  id text primary key default (gen_random_uuid()),
  customer_name text not null,
  customer_phone text not null,
  notes text,
  items text not null,
  total numeric(12, 2) not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmado', 'rechazado')),
  eta_minutes int,
  created_at text not null default (now()),
  responded_at text,
  kitchen_status text check (kitchen_status in ('pendiente', 'preparando', 'listo', 'despachado')),
  kitchen_sent_at text,
  customer_address text,
  fulfillment text not null default 'retiro' check (fulfillment in ('retiro', 'delivery')),
  delivery_zone text,
  shipping_cost numeric(10, 2) not null default 0
);

create index if not exists gestion_web_orders_status_idx on gestion_web_orders(status);
create index if not exists gestion_web_orders_phone_idx on gestion_web_orders(customer_phone);

create table if not exists gestion_shifts (
  id text primary key default (gen_random_uuid()),
  status text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  opening_cash numeric(12, 2) not null default 0,
  opened_at text not null default (now()),
  closed_at text,
  counted_cash numeric(12, 2),
  expected_cash numeric(12, 2),
  difference numeric(12, 2),
  sales_efectivo numeric(12, 2) not null default 0,
  sales_transferencia numeric(12, 2) not null default 0,
  sales_cuenta_corriente numeric(12, 2) not null default 0,
  notes text,
  expenses_efectivo numeric(12, 2) not null default 0,
  ingresos_efectivo numeric(12, 2) not null default 0,
  retiros_efectivo numeric(12, 2) not null default 0,
  ajustes_efectivo numeric(12, 2) not null default 0
);

create index if not exists gestion_shifts_status_idx on gestion_shifts(status);
create unique index if not exists gestion_shifts_single_open_idx on gestion_shifts(status) where status = 'abierto';

create table if not exists gestion_meta (
  key text primary key,
  value text
);

create table if not exists gestion_reservations (
  id text primary key default (gen_random_uuid()),
  customer_name text not null,
  customer_phone text not null,
  party_size int not null,
  reservation_date text not null,
  reservation_time text not null,
  notes text,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmada', 'rechazada')),
  created_at text not null default (now()),
  responded_at text
);

create table if not exists gestion_expenses (
  id text primary key default (gen_random_uuid()),
  concept text not null,
  amount numeric(12, 2) not null,
  payment_method text not null default 'efectivo' check (payment_method in ('efectivo', 'transferencia')),
  created_at text not null default (now())
);

create index if not exists gestion_expenses_created_at_idx on gestion_expenses(created_at);

create index if not exists gestion_reservations_status_idx on gestion_reservations(status);

create table if not exists gestion_delivery_zones (
  id integer primary key autoincrement,
  name text unique not null,
  cost numeric(10, 2) not null default 0
);

create table if not exists gestion_delivery_customers (
  phone text primary key,
  name text not null,
  address text,
  updated_at text not null default (now())
);

create table if not exists gestion_loyalty_accounts (
  phone text primary key,
  stamps int not null default 0,
  redeemed int not null default 0,
  updated_at text not null default (now()),
  name text,
  order_count int not null default 0,
  total_spent numeric(12, 2) not null default 0,
  origin text
);

-- Infraestructura de preparación (sin UI todavía): ver schema.sql.
create table if not exists gestion_payment_methods (
  id integer primary key autoincrement,
  nombre text unique not null,
  activo boolean not null default 1
);

create table if not exists gestion_print_areas (
  id integer primary key autoincrement,
  nombre text unique not null
);

create table if not exists gestion_afip_config (
  id integer primary key autoincrement,
  cuit text,
  punto_venta int,
  condicion_iva text,
  habilitado boolean not null default 0
);

create table if not exists gestion_business_config (
  id int primary key default 1,
  name text,
  address text,
  hours text,
  whatsapp_number text,
  logo_url text
);

create table if not exists gestion_print_config (
  id int primary key default 1,
  paper_width_mm int not null default 80,
  header_text text,
  footer_text text,
  paper_saving_mode boolean not null default 0,
  font_size_header text not null default 'normal',
  font_size_body text not null default 'normal',
  font_size_footer text not null default 'normal',
  direct_print_enabled boolean not null default 0,
  printer_name text
);

create table if not exists gestion_users (
  id integer primary key autoincrement,
  name text not null,
  pin_hash text not null,
  role text not null check (role in ('admin', 'encargado', 'mozo', 'cocina')),
  active boolean not null default 1,
  created_at text not null default (now()),
  updated_at text not null default (now())
);

create table if not exists gestion_sessions (
  token text primary key,
  user_id int not null references gestion_users(id) on delete cascade,
  created_at text not null default (now()),
  expires_at text not null
);

create index if not exists gestion_sessions_user_id_idx on gestion_sessions(user_id);

create table if not exists gestion_audit_log (
  id integer primary key autoincrement,
  user_id int references gestion_users(id),
  action text not null,
  entity text,
  entity_id text,
  old_value text,
  new_value text,
  created_at text not null default (now())
);

create index if not exists gestion_audit_log_created_at_idx on gestion_audit_log(created_at);
create index if not exists gestion_audit_log_entity_idx on gestion_audit_log(entity, entity_id);

create table if not exists gestion_cash_movements (
  id text primary key default (gen_random_uuid()),
  shift_id text references gestion_shifts(id) on delete cascade,
  type text not null check (type in ('retiro', 'ingreso', 'ajuste')),
  amount numeric(12, 2) not null,
  payment_method text not null default 'efectivo' check (payment_method in ('efectivo', 'transferencia')),
  note text,
  user_id int references gestion_users(id),
  created_at text not null default (now())
);

create index if not exists gestion_cash_movements_shift_id_idx on gestion_cash_movements(shift_id);

create table if not exists gestion_stock_movements (
  id text primary key default (gen_random_uuid()),
  product_id int references gestion_products(id) on delete set null,
  ingredient_id int,
  type text not null check (type in ('compra', 'venta', 'receta', 'ajuste_positivo', 'ajuste_negativo', 'merma', 'devolucion')),
  quantity numeric(12, 3) not null,
  reference_type text,
  reference_id text,
  note text,
  user_id int references gestion_users(id),
  created_at text not null default (now())
);

create index if not exists gestion_stock_movements_product_id_idx on gestion_stock_movements(product_id);
create index if not exists gestion_stock_movements_created_at_idx on gestion_stock_movements(created_at);

create table if not exists gestion_ingredients (
  id integer primary key autoincrement,
  external_id int unique,
  category text,
  name text not null,
  cost numeric(12, 2) not null default 0,
  supplier text,
  unit text not null default 'unid.',
  active boolean not null default 1,
  created_at text not null default (now()),
  updated_at text not null default (now()),
  track_stock boolean not null default 0,
  stock_qty numeric(12, 3)
);

create table if not exists gestion_ingredient_price_history (
  id integer primary key autoincrement,
  ingredient_id int not null references gestion_ingredients(id) on delete cascade,
  cost numeric(12, 2) not null,
  created_at text not null default (now())
);

create index if not exists gestion_ingredient_price_history_ingredient_id_idx
  on gestion_ingredient_price_history(ingredient_id);

create table if not exists gestion_recipes (
  id integer primary key autoincrement,
  product_id int unique not null references gestion_products(id) on delete cascade,
  created_at text not null default (now()),
  updated_at text not null default (now())
);

create table if not exists gestion_recipe_items (
  id integer primary key autoincrement,
  recipe_id int not null references gestion_recipes(id) on delete cascade,
  ingredient_id int not null references gestion_ingredients(id) on delete cascade,
  quantity numeric(12, 3) not null,
  unique (recipe_id, ingredient_id)
);

create index if not exists gestion_recipe_items_recipe_id_idx on gestion_recipe_items(recipe_id);

create table if not exists gestion_suppliers (
  id integer primary key autoincrement,
  external_id int unique,
  name text not null,
  phone text,
  address text,
  active boolean not null default 1
);

create table if not exists gestion_purchases (
  id text primary key default (gen_random_uuid()),
  supplier_id int references gestion_suppliers(id),
  purchased_at text not null default (now()),
  payment_method text not null default 'efectivo' check (payment_method in ('efectivo', 'transferencia', 'cuenta_corriente')),
  total numeric(12, 2) not null default 0,
  note text,
  user_id int references gestion_users(id),
  created_at text not null default (now())
);

create table if not exists gestion_purchase_items (
  id text primary key default (gen_random_uuid()),
  purchase_id text not null references gestion_purchases(id) on delete cascade,
  ingredient_id int references gestion_ingredients(id),
  product_id int references gestion_products(id),
  quantity numeric(12, 3) not null,
  unit_cost numeric(12, 2) not null,
  line_total numeric(12, 2) not null,
  check (
    (ingredient_id is not null and product_id is null) or
    (ingredient_id is null and product_id is not null)
  )
);

create index if not exists gestion_purchases_supplier_id_idx on gestion_purchases(supplier_id);
create index if not exists gestion_purchase_items_purchase_id_idx on gestion_purchase_items(purchase_id);
