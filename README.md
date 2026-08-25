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
