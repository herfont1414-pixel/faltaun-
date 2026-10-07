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
  delivery_status text check (delivery_status in ('preparando', 'en_camino', 'entregado'))
);

create table if not exists gestion_order_items (
  id text primary key default (gen_random_uuid()),
  order_id text references gestion_orders(id) on delete cascade,
  product_name text not null,
  price numeric(10, 2) not null,
  qty int not null default 1,
  sent_to_kitchen boolean not null default false
);

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
  kitchen_sent_at text
);

create index if not exists gestion_web_orders_status_idx on gestion_web_orders(status);

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
  expenses_efectivo numeric(12, 2) not null default 0
);

create index if not exists gestion_shifts_status_idx on gestion_shifts(status);

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
