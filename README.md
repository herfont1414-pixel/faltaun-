# MaderoSys — Madero Restó

Sistema propio para "Madero Restó": sitio público con menú y reservas, y un
panel interno (`/admin`) para tomar pedidos por mesa/mostrador, cobrar y
recibir los pedidos hechos desde el menú online. Todo corre sobre una única
base de datos Postgres propia — no depende de Fudo ni de ninguna API externa.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- lucide-react
- Postgres (vía `pg`, sin ORM)

## Estructura

```
app/
  page.tsx              sitio público: header, menú + carrito, reservas
  layout.tsx / icon.tsx  metadata PWA y favicon
  admin/                 panel interno (protegido por PIN)
    login/               pantalla de PIN
    page.tsx             mesas / mostrador / pedidos web / productos
    comanda/[orderId]/   ticket imprimible (cocina/barra)
  api/
    orders/              POST público: crear pedido desde el menú online
    admin/                endpoints del panel (protegidos por middleware)
components/
  menu/                  menú público + carrito (cart-context, checkout-modal)
  admin/                 UI del panel interno
lib/
  menu.ts                arma el menú público desde la misma base
  admin/                 store, tipos, conexión a Postgres, pedidos web
data/                    catálogo y clientes reales exportados de Fudo
db/schema.sql            schema completo de Postgres
scripts/seed-admin.mjs   carga schema + datos reales (idempotente)
```

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Variables de entorno (`.env.local`):

- `DATABASE_URL`: cadena de conexión a un Postgres (podés crear uno gratis
  desde Vercel: Storage → Create Database → Postgres). Sin esta variable, el
  menú público usa datos de muestra y `/admin` muestra un aviso en vez de
  romperse.
- `ADMIN_PIN`: PIN de 4 dígitos para entrar a `/admin`.
- `NEXT_PUBLIC_WHATSAPP_NUMBER`: número del local para el botón de consultas.

**No hace falta correr nada a mano**: la primera vez que la app recibe una
visita con `DATABASE_URL` configurada y la base vacía, se auto-configura
sola (aplica `db/schema.sql` y carga el catálogo/clientes reales de
`data/*.json`). Es seguro que pase más de una vez — actualiza en vez de
duplicar. `npm run seed:admin` sigue disponible para forzarlo a mano en
desarrollo local si hace falta.

## Sitio público

- Menú filtrable por categoría, cargado directo desde la base (mismo
  catálogo que usa el panel interno).
- Carrito: "Agregar al pedido" en la ficha de cada plato, botón flotante con
  el total, y checkout pidiendo nombre + WhatsApp. El pedido llega en vivo
  al panel `/admin` → Pedidos web.
- Reservas: hoy arma un mensaje de WhatsApp (no persiste en base todavía).

## Panel interno — `/admin`

Protegido por PIN (`ADMIN_PIN`, teclado numérico en `/admin/login`).

- **Mesas**: 35 en Salón (1–35) y 10 en Terraza (36–45). Tomar pedido,
  enviar a cocina (imprime comanda), pedir cuenta, cobrar.
- **Mostrador**: pedidos sin mesa asignada, listado de en curso/cerradas.
- **Pedidos web**: escucha los pedidos hechos desde el menú online — alerta
  sonora + aviso en pantalla al llegar uno nuevo. Confirmar con tiempo
  estimado (15/30/45 min) abre WhatsApp con el mensaje ya armado para el
  cliente, o rechazar.
- **Productos** (ícono en la barra superior): activar/pausar platos y
  editar precios en vivo — se reflejan al instante en Mesas y en el menú
  público.
- **Cobro**: Efectivo, Transferencia o Cta. Cte. (busca entre los clientes
  reales con cuenta corriente, descuenta el saldo y deja registro en el
  historial).
- **Comandas**: "Enviar a cocina" abre un ticket imprimible (80mm),
  separado en BARRA (bebidas) y COCINA (el resto), que se imprime solo.
- Placeholders (todavía no construidos): Delivery, Mostrador express,
  Reservas, Cocina (KDS en pantalla), Caja, Stock, Gastos, Reportes.

## Pendiente

- Íconos reales en `public/icons/` (192x192 y 512x512) para el manifest de
  la PWA (el favicon del navegador ya se genera solo).
- Persistir reservas en base (hoy el flujo confirma por WhatsApp).
- `data/ingredientes.csv` y `data/proveedores.json` quedan guardados para
  los futuros módulos de Stock y Gastos.
