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
del sitio público. Reemplaza de a poco a Fudo, empezando por Mesas + Mostrador
con persistencia real en el servidor (antes era un prototipo que vivía solo en
el navegador y se perdía al recargar).

- Acceso protegido por una contraseña compartida: definí `GESTION_PASSWORD` en
  las variables de entorno (`.env.local` en desarrollo, o el panel de variables
  de tu hosting en producción). Sin esa variable, `/gestion` queda bloqueado
  para todos.
- Carta real cargada desde `data/catalogo_productos.json` (291 productos,
  Entradas/Al Plato/Burger/Sandwiches/Pizzas/etc.), extraída de Fudo.
- `data/ingredientes.csv` queda guardado para el futuro módulo de
  Productos/Stock (todavía no implementado).
- 35 mesas en Salón (1–35) y 10 en Terraza (36–45), igual que el prototipo
  aprobado.
- Implementado: Mesas (tomar pedido, enviar a cocina, pedir cuenta, cobrar,
  liberar mesa) y Mostrador (pedidos sin mesa, listado de en curso/cerradas).
- Placeholders (todavía no construidos): Delivery, Mostrador express,
  Reservas, Cocina (KDS), Caja, Productos/Stock, Gastos, Reportes.
- El estado vive en memoria del proceso del servidor (`lib/gestion/store.ts`).
  Sirve para un único servidor corriendo de forma continua; si se necesita
  persistencia entre reinicios o múltiples instancias, migrar ese store a
  Supabase (dejar el mismo shape de datos).
