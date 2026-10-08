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

-- Referencia al producto, además de product_name/price (que se mantienen
-- como "foto" histórica de lo vendido: cambiar el precio de un producto no
-- debe recalcular ventas pasadas). Nullable porque los ítems de pedidos ya
-- cerrados antes de esta migración no tienen esta referencia, y porque un
-- producto se puede dar de baja sin perder el historial de lo vendido.
alter table gestion_order_items add column if not exists product_id int references gestion_products(id) on delete set null;

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
alter table gestion_shifts add column if not exists ingresos_efectivo numeric(12, 2) not null default 0;
alter table gestion_shifts add column if not exists retiros_efectivo numeric(12, 2) not null default 0;
alter table gestion_shifts add column if not exists ajustes_efectivo numeric(12, 2) not null default 0;

create index if not exists gestion_shifts_status_idx on gestion_shifts(status);

-- Un solo turno abierto a la vez, reforzado a nivel de base (no solo con el
-- "select ... where status = 'abierto'" de openShift(), que por sí solo
-- tiene una ventana de carrera entre el select y el insert).
create unique index if not exists gestion_shifts_single_open_idx on gestion_shifts(status) where status = 'abierto';

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

-- Para "clientes nuevos hoy" en el dashboard (Fase 12). No existía una
-- fecha de alta — para los registros que ya existían antes de esta
-- migración, created_at queda en el momento en que corre la migración
-- (no se puede reconstruir la fecha real de su primer pedido), así que el
-- día que se aplique esta migración va a mostrar a todos como "nuevos" por
-- única vez; de ahí en más es una fecha de alta real.
alter table gestion_delivery_customers add column if not exists created_at timestamptz not null default now();

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

-- Un pedido = una sola operación de fidelidad, incluso si addStamp() se
-- llama dos veces para el mismo pedido (doble click, reintento de red):
-- el unique (order_id, type) hace que la segunda inserción sea un no-op
-- (ver "on conflict do nothing" en loyalty.ts), así nunca se suma un sello
-- de más por el mismo pedido.
create table if not exists gestion_loyalty_transactions (
  id serial primary key,
  phone text not null,
  order_id text,
  type text not null default 'stamp',
  stamps int not null default 0,
  amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (order_id, type)
);

create index if not exists gestion_loyalty_transactions_phone_idx on gestion_loyalty_transactions(phone);

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

-- Movimientos de caja que no tienen otra tabla propia: retiro de dinero
-- (distinto de un gasto — sale efectivo de la caja pero no es un costo del
-- negocio), ingreso extra, y ajuste manual. Las ventas y los gastos ya se
-- pueden reconstruir desde gestion_order_payments y gestion_expenses
-- respectivamente, así que no se duplican acá.
create table if not exists gestion_cash_movements (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references gestion_shifts(id) on delete cascade,
  type text not null check (type in ('retiro', 'ingreso', 'ajuste')),
  amount numeric(12, 2) not null,
  payment_method text not null default 'efectivo' check (payment_method in ('efectivo', 'transferencia')),
  note text,
  user_id int references gestion_users(id),
  created_at timestamptz not null default now()
);

create index if not exists gestion_cash_movements_shift_id_idx on gestion_cash_movements(shift_id);

-- Historial de movimientos de stock: por qué cambió la cantidad disponible
-- de un producto (o, más adelante, un ingrediente de receta), no solo el
-- número final. gestion_products.stock_qty sigue siendo el valor actual
-- (no se elimina ni se reemplaza); esta tabla es la bitácora de cómo se
-- llegó a ese número. ingredient_id queda listo para cuando exista
-- gestion_ingredients (recetas/costos); por ahora siempre es null.
create table if not exists gestion_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id int references gestion_products(id) on delete set null,
  ingredient_id int,
  type text not null check (type in ('compra', 'venta', 'receta', 'ajuste_positivo', 'ajuste_negativo', 'merma', 'devolucion')),
  quantity numeric(12, 3) not null,
  reference_type text,
  reference_id text,
  note text,
  user_id int references gestion_users(id),
  created_at timestamptz not null default now()
);

create index if not exists gestion_stock_movements_product_id_idx on gestion_stock_movements(product_id);
create index if not exists gestion_stock_movements_created_at_idx on gestion_stock_movements(created_at);

-- Ingredientes para recetas/costos (semilla desde data/ingredientes.csv).
-- external_id es el ID de esa planilla, para poder volver a sincronizar
-- sin duplicar si se actualiza el archivo.
create table if not exists gestion_ingredients (
  id serial primary key,
  external_id int unique,
  category text,
  name text not null,
  cost numeric(12, 2) not null default 0,
  supplier text,
  unit text not null default 'unid.',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historial de costo: cada vez que cambia gestion_ingredients.cost queda
-- una fila acá, para poder ver la tendencia de precio de un ingrediente.
create table if not exists gestion_ingredient_price_history (
  id serial primary key,
  ingredient_id int not null references gestion_ingredients(id) on delete cascade,
  cost numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists gestion_ingredient_price_history_ingredient_id_idx
  on gestion_ingredient_price_history(ingredient_id);

-- Una receta por producto (opcional: no todos los productos necesitan
-- una). El costo se recalcula siempre desde el costo ACTUAL de cada
-- ingrediente — no se guarda un costo congelado acá a propósito, porque
-- lo que se congela para no alterar ventas pasadas es el precio de venta
-- del pedido (gestion_order_items.price), nunca el costo de la receta.
create table if not exists gestion_recipes (
  id serial primary key,
  product_id int unique not null references gestion_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gestion_recipe_items (
  id serial primary key,
  recipe_id int not null references gestion_recipes(id) on delete cascade,
  ingredient_id int not null references gestion_ingredients(id) on delete cascade,
  quantity numeric(12, 3) not null,
  unique (recipe_id, ingredient_id)
);

create index if not exists gestion_recipe_items_recipe_id_idx on gestion_recipe_items(recipe_id);

-- La planilla de ingredientes ya traía "Control de Stock"/"Stock" para
-- algunos; se agregan acá para poder sumarles cantidad al confirmar una
-- compra (igual que gestion_products.stock_qty, pero del lado de insumos).
alter table gestion_ingredients add column if not exists track_stock boolean not null default false;
alter table gestion_ingredients add column if not exists stock_qty numeric(12, 3);

-- Proveedores (migrado desde data/proveedores.json, igual criterio que
-- gestion_customers: external_id para no duplicar al re-sincronizar).
create table if not exists gestion_suppliers (
  id serial primary key,
  external_id int unique,
  name text not null,
  phone text,
  address text,
  active boolean not null default true
);

-- Una compra puede traer ítems de ingredientes (alimentan recetas) o de
-- productos (se revenden directo, ej. bebidas) — nunca ambos en el mismo
-- ítem. Confirmar la compra es lo que efectivamente sube el stock, ajusta
-- el costo del ingrediente y deja constancia en gestion_stock_movements;
-- no hay un estado "borrador" separado, se registra ya confirmada.
create table if not exists gestion_purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id int references gestion_suppliers(id),
  purchased_at timestamptz not null default now(),
  payment_method text not null default 'efectivo' check (payment_method in ('efectivo', 'transferencia', 'cuenta_corriente')),
  total numeric(12, 2) not null default 0,
  note text,
  user_id int references gestion_users(id),
  created_at timestamptz not null default now()
);

create table if not exists gestion_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references gestion_purchases(id) on delete cascade,
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
