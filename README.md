# Madero Restó

PWA de menú y reservas para un restaurante y bar moderno.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- lucide-react
- Supabase (Postgres)

## Estructura

```
app/                  rutas (App Router)
  layout.tsx          layout raíz + metadata PWA
  page.tsx            home: header, menú, reservas
  globals.css
components/
  header.tsx
  whatsapp-button.tsx
  menu/
    menu-section.tsx  componente principal del menú
    category-filter.tsx
    menu-card.tsx
    menu-modal.tsx
  reservations/
    reservation-form.tsx
lib/
  types.ts
  menu.ts             fetch de platos (Supabase o datos de muestra)
  whatsapp.ts          helpers para links de wa.me
  supabase/client.ts
  data/sample-menu.ts  datos de muestra para desarrollo sin Supabase
supabase/
  schema.sql          tablas menu_items y reservations
public/
  manifest.json
```

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Completá `.env.local` con la URL y anon key de tu proyecto de Supabase, y el número de WhatsApp del local. Sin esas variables la app funciona igual con datos de muestra (`lib/data/sample-menu.ts`).

Para el menú dinámico, corré `supabase/schema.sql` en el SQL editor de tu proyecto de Supabase.

## Pendiente

- Íconos reales en `public/icons/` (192x192 y 512x512) para el manifest.
- Persistir reservas en la tabla `reservations` (hoy el flujo confirma por WhatsApp).
- Service worker si se busca soporte offline completo.

## Gestión interna (GastroSys) — `/gestion`

Módulo de uso interno (staff) para tomar pedidos por mesa y mostrador, separado
del sitio público. Reemplaza de a poco a Fudo. Lee y escribe directo en una
base de datos Postgres propia (no depende de ninguna API externa).

### Base de datos

- Necesitás una base de datos Postgres y su cadena de conexión en la variable
  `DATABASE_URL` (podés crear una gratis desde Vercel: Storage → Create
  Database → Postgres, o usar Supabase/cualquier Postgres). Sin esa variable,
  `/gestion` muestra un aviso de "falta conectar la base de datos" en vez de
  romperse.
- Una vez que tengas `DATABASE_URL`, corré `npm run seed:gestion`: aplica el
  schema (`supabase/schema_gestion.sql`) y carga los datos reales exportados
  de Fudo (`data/catalogo_productos.json`, `data/clientes.json`,
  `data/cuentas_corrientes.json`). Es seguro correrlo varias veces: actualiza
  precios/clientes en vez de duplicarlos.
- Acceso a `/gestion` protegido por una contraseña compartida: definí
  `GESTION_PASSWORD` en las variables de entorno.
- `data/ingredientes.csv` y `data/proveedores.json` quedan guardados para el
  futuro módulo de Productos/Stock y Gastos (todavía no implementados).

### Módulos

- **Mesas**: 35 en Salón (1–35) y 10 en Terraza (36–45). Tomar pedido, enviar
  a cocina (imprime comanda), pedir cuenta, cobrar.
- **Mostrador**: pedidos sin mesa asignada, listado de en curso/cerradas.
- **Cobro**: al cobrar se elige medio de pago — Efectivo, Transferencia o
  Cta. Cte. (busca entre los clientes reales con cuenta corriente habilitada
  y descuenta el total de su saldo, dejando un registro en
  `gestion_customer_ledger`).
- **Comandas**: "Enviar a cocina" abre una ficha lista para imprimir
  (`/gestion/comanda/[orderId]`, formato 80mm), separada en BARRA (bebidas) y
  COCINA (el resto), e imprime automáticamente al abrirse — apuntá esa
  ventana a tu impresora térmica desde el diálogo de impresión del navegador.
- Placeholders (todavía no construidos): Delivery, Mostrador express,
  Reservas, Cocina (KDS en pantalla), Caja, Productos/Stock, Gastos, Reportes.
