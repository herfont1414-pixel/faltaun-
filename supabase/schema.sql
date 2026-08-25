create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  price numeric(10, 2) not null,
  image_url text,
  category text not null check (category in ('comidas', 'tragos', 'vinos', 'postres')),
  featured boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  date date not null,
  time time not null,
  guests integer not null check (guests > 0),
  notes text,
  created_at timestamptz not null default now()
);

alter table menu_items enable row level security;
alter table reservations enable row level security;

create policy "Menu items are publicly readable"
  on menu_items for select
  using (true);

create policy "Anyone can create a reservation"
  on reservations for insert
  with check (true);
