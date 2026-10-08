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
alter table gestion_products add column if not exists stock_qty int;
-- print_area_id se agrega más abajo, después de crear gestion_print_areas
-- (la FK necesita que esa tabla ya exista).

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
alter table gestion_orders add column if not exists is_delivery boolean not null default false;
alter table gestion_orders add column if not exists customer_name text;
alter table gestion_orders add column if not exists customer_phone text;
alter table gestion_orders add column if not exists customer_address text;
alter table gestion_orders add column if not exists delivery_zone text;
alter table gestion_orders add column if not exists shipping_cost numeric(10, 2) not null default 0;
alter table gestion_orders add column if not exists delivery_person text;
alter table gestion_orders add column if not exists delivery_status text
  check (delivery_status in ('preparando', 'en_camino', 'entregado'));
alter table gestion_orders add column if not exists notes text;
alter table gestion_orders add column if not exists party_size int;
alter table gestion_orders add column if not exists waiter text;

-- Desglose de pagos de una venta: una fila por medio de pago usado (una
-- venta puede pagarse combinando varios, ej. parte efectivo + parte
-- transferencia). gestion_orders.payment_method sigue existiendo y se
-- sigue llenando cuando la venta tiene un solo medio (compatibilidad con
-- lo que ya leía Reportes/Caja de ahí); cuando son varios, queda en null
-- y esta tabla es la fuente de verdad.
create table if not exists gestion_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references gestion_orders(id) on delete cascade,
  method text not null check (method in ('efectivo', 'transferencia', 'cuenta_corriente')),
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists gestion_order_payments_order_id_idx on gestion_order_payments(order_id);

-- Backfill idempotente: toda venta cerrada de antes de esta tabla también
-- queda con su línea de pago, para que Caja/Reportes (que ahora suman
-- desde acá) no pierdan el historial.
insert into gestion_order_payments (order_id, method, amount)
select o.id, o.payment_method, o.total
from gestion_orders o
where o.status = 'cerrada' and o.payment_method is not null
  and not exists (select 1 from gestion_order_payments gop where gop.order_id = o.id);

create table if not exists gestion_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references gestion_orders(id) on delete cascade,
  product_name text not null,
  price numeric(10, 2) not null,
  qty int not null default 1,
  sent_to_kitchen boolean not null default false
);

alter table gestion_order_items add column if not exists note text;

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
alter table gestion_web_orders add column if not exists customer_address text;
alter table gestion_web_orders add column if not exists fulfillment text not null default 'retiro'
  check (fulfillment in ('retiro', 'delivery'));
alter table gestion_web_orders add column if not exists delivery_zone text;
alter table gestion_web_orders add column if not exists shipping_cost numeric(10, 2) not null default 0;

create index if not exists gestion_web_orders_status_idx on gestion_web_orders(status);
create index if not exists gestion_web_orders_phone_idx on gestion_web_orders(customer_phone);

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

alter table gestion_shifts add column if not exists expenses_efectivo numeric(12, 2) not null default 0;

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

create table if not exists gestion_expenses (
  id uuid primary key default gen_random_uuid(),
  concept text not null,
  amount numeric(12, 2) not null,
  payment_method text not null default 'efectivo' check (payment_method in ('efectivo', 'transferencia')),
  created_at timestamptz not null default now()
);

create index if not exists gestion_expenses_created_at_idx on gestion_expenses(created_at);

create table if not exists gestion_delivery_zones (
  id serial primary key,
  name text unique not null,
  cost numeric(10, 2) not null default 0
);

create table if not exists gestion_delivery_customers (
  phone text primary key,
  name text not null,
  address text,
  updated_at timestamptz not null default now()
);

create table if not exists gestion_loyalty_accounts (
  phone text primary key,
  stamps int not null default 0,
  redeemed int not null default 0,
  updated_at timestamptz not null default now()
);

alter table gestion_loyalty_accounts add column if not exists name text;
alter table gestion_loyalty_accounts add column if not exists order_count int not null default 0;
alter table gestion_loyalty_accounts add column if not exists total_spent numeric(12, 2) not null default 0;
alter table gestion_loyalty_accounts add column if not exists origin text;

-- Infraestructura de preparación (sin UI todavía): medios de pago
-- configurables, áreas de impresión de comandas y datos de facturación
-- AFIP, listas para que un módulo futuro las use sin tener que migrar
-- la base de nuevo.
create table if not exists gestion_payment_methods (
  id serial primary key,
  nombre text unique not null,
  activo boolean not null default true
);

create table if not exists gestion_print_areas (
  id serial primary key,
  nombre text unique not null
);

alter table gestion_products add column if not exists print_area_id int references gestion_print_areas(id);

insert into gestion_print_areas (nombre) values ('Barra'), ('Cocina')
on conflict (nombre) do nothing;

create table if not exists gestion_afip_config (
  id serial primary key,
  cuit text,
  punto_venta int,
  condicion_iva text,
  habilitado boolean not null default false
);

insert into gestion_afip_config (id) values (1) on conflict (id) do nothing;

-- Datos del local: una única fila (id = 1) con nombre, dirección, horario
-- y el WhatsApp del negocio. Reemplaza en runtime a NEXT_PUBLIC_WHATSAPP_NUMBER
-- cuando está cargado, para poder cambiar el número sin redeploy.
create table if not exists gestion_business_config (
  id int primary key default 1,
  name text,
  address text,
  hours text,
  whatsapp_number text
);

-- logo_url se agregó después de que esta tabla ya existiera en producción;
-- "create table if not exists" no le agrega columnas a una tabla vieja.
alter table gestion_business_config add column if not exists logo_url text;

insert into gestion_business_config (id) values (1) on conflict (id) do nothing;

-- Configuración del motor de impresión térmica: una única fila (id = 1)
-- con las opciones de ancho de papel, textos de encabezado/pie, modo
-- ahorro de papel y tamaños de letra por sección.
create table if not exists gestion_print_config (
  id int primary key default 1,
  paper_width_mm int not null default 80,
  header_text text,
  footer_text text,
  paper_saving_mode boolean not null default false,
  font_size_header text not null default 'normal',
  font_size_body text not null default 'normal',
  font_size_footer text not null default 'normal'
);

-- Agregadas después de que la tabla ya existiera en producción.
alter table gestion_print_config add column if not exists direct_print_enabled boolean not null default false;
alter table gestion_print_config add column if not exists printer_name text;

insert into gestion_print_config (id) values (1) on conflict (id) do nothing;

-- Usuarios del sistema de gestión. El PIN nunca se guarda en texto plano:
-- pin_hash es scrypt(salt + pin). El rol determina qué puede hacer cada
-- usuario; la autorización se valida en el backend (ver lib/admin/auth.ts),
-- no solamente ocultando botones en la interfaz.
create table if not exists gestion_users (
  id serial primary key,
  name text not null,
  pin_hash text not null,
  role text not null check (role in ('admin', 'encargado', 'mozo', 'cocina')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sesiones de admin: el cookie "admin_session" guarda este token opaco
-- generado al azar, nunca el PIN real. Cada sesión expira sola.
create table if not exists gestion_sessions (
  token text primary key,
  user_id int not null references gestion_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists gestion_sessions_user_id_idx on gestion_sessions(user_id);

-- Auditoría de acciones sensibles: quién hizo qué, sobre qué entidad, y
-- los valores antes/después (como JSON en texto, para no atarse a un tipo
-- de columna por cada clase de dato auditado).
create table if not exists gestion_audit_log (
  id serial primary key,
  user_id int references gestion_users(id),
  action text not null,
  entity text,
  entity_id text,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists gestion_audit_log_created_at_idx on gestion_audit_log(created_at);
create index if not exists gestion_audit_log_entity_idx on gestion_audit_log(entity, entity_id);
