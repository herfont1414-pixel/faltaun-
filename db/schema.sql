create extension if not exists pgcrypto;

create table if not exists gestion_categories (
  id serial primary key,
  name text unique not null,
  sort_order int not null default 0
);

create table if not exists gestion_products (
  id serial primary key,
  category_id int references gestion_categories(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null,
  active boolean not null default true,
  unique (category_id, name)
);

alter table gestion_products add column if not exists in_stock boolean not null default true;

create table if not exists gestion_customers (
  id serial primary key,
  external_id int unique,
  name text not null,
  phone text,
  balance numeric(12, 2) not null default 0,
  cuenta_corriente boolean not null default false,
  active boolean not null default true
);

create table if not exists gestion_customer_ledger (
  id serial primary key,
  external_id int unique,
  customer_id int references gestion_customers(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  amount numeric(12, 2) not null,
  type text,
  payment_method text,
  note text
);

create table if not exists gestion_zones (
  id serial primary key,
  name text unique not null,
  sort_order int not null default 0
);

create table if not exists gestion_tables (
  id serial primary key,
  zone_id int references gestion_zones(id) on delete cascade,
  number int unique not null,
  status text not null default 'libre' check (status in ('libre', 'ocupada', 'atencion', 'cobrando'))
);

create table if not exists gestion_orders (
  id uuid primary key default gen_random_uuid(),
  table_id int references gestion_tables(id),
  origin text not null default 'mesa' check (origin in ('mesa', 'mostrador')),
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  payment_method text check (payment_method in ('efectivo', 'transferencia', 'cuenta_corriente')),
  customer_id int references gestion_customers(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table gestion_orders add column if not exists total numeric(12, 2) not null default 0;
alter table gestion_orders add column if not exists kitchen_status text
  check (kitchen_status in ('pendiente', 'preparando', 'listo', 'despachado'));
alter table gestion_orders add column if not exists kitchen_sent_at timestamptz;

create table if not exists gestion_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references gestion_orders(id) on delete cascade,
  product_name text not null,
  price numeric(10, 2) not null,
  qty int not null default 1,
  sent_to_kitchen boolean not null default false
);

create index if not exists gestion_order_items_order_id_idx on gestion_order_items(order_id);
create index if not exists gestion_orders_status_idx on gestion_orders(status);
create index if not exists gestion_customer_ledger_customer_id_idx on gestion_customer_ledger(customer_id);

create table if not exists gestion_web_orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  notes text,
  items jsonb not null,
  total numeric(12, 2) not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmado', 'rechazado')),
  eta_minutes int,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

alter table gestion_web_orders add column if not exists kitchen_status text
  check (kitchen_status in ('pendiente', 'preparando', 'listo', 'despachado'));
alter table gestion_web_orders add column if not exists kitchen_sent_at timestamptz;

create index if not exists gestion_web_orders_status_idx on gestion_web_orders(status);

create table if not exists gestion_shifts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  opening_cash numeric(12, 2) not null default 0,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  counted_cash numeric(12, 2),
  expected_cash numeric(12, 2),
  difference numeric(12, 2),
  sales_efectivo numeric(12, 2) not null default 0,
  sales_transferencia numeric(12, 2) not null default 0,
  sales_cuenta_corriente numeric(12, 2) not null default 0,
  notes text
);

create index if not exists gestion_shifts_status_idx on gestion_shifts(status);

create table if not exists gestion_meta (
  key text primary key,
  value text
);

create table if not exists gestion_reservations (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  party_size int not null,
  reservation_date text not null,
  reservation_time text not null,
  notes text,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmada', 'rechazada')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists gestion_reservations_status_idx on gestion_reservations(status);
