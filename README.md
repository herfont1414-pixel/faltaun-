# MaderoSys — Madero Restó

Sistema propio para "Madero Restó": sitio público con menú y reservas, y un
panel interno (`/admin`) para tomar pedidos por mesa/mostrador, cobrar y
recibir los pedidos hechos desde el menú online. Todo corre sobre una única
base de datos Postgres propia — no depende de Fudo ni de ninguna API externa.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- lucide-react
- Postgres (vía `pg`, sin ORM) en la nube; SQLite (vía `better-sqlite3`) como
  respaldo local — ver "Modo local / offline" más abajo

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
  admin/                 store, tipos, conexión a la base (Postgres o SQLite), pedidos web
data/                    catálogo y clientes reales exportados de Fudo
db/schema.sql            schema completo de Postgres
db/schema.sqlite.sql     mismo schema, adaptado a SQLite (modo local)
scripts/seed-admin.mjs   carga schema + datos reales (idempotente)
start-local.bat          arranca la app en modo local (Windows, sin internet)
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

El catálogo (`data/catalogo_productos.json`) también se resincroniza solo
en cada deploy, incluso si la base ya tenía datos cargados: compara un hash
del archivo contra lo guardado en la tabla `gestion_meta`, y si cambió,
actualiza precios, da de alta productos nuevos y pausa (no borra) los que ya
no están en el archivo. Para marcar un producto "sin stock" directamente en
el archivo, agregá `"inStock": false` a su entrada.

## Sitio público

- Menú filtrable por categoría, cargado directo desde la base (mismo
  catálogo que usa el panel interno).
- Carrito: "Agregar al pedido" en la ficha de cada plato, botón flotante con
  el total, y checkout pidiendo nombre + WhatsApp. El pedido llega en vivo
  al panel `/admin` → Pedidos web.
- Reservas: pide fecha, horario, personas, nombre y WhatsApp, y queda
  guardada en la base — llega en vivo al panel `/admin` → Reservas.

## Panel interno — `/admin`

Protegido por PIN (`ADMIN_PIN`, teclado numérico en `/admin/login`).

- **Mesas**: 35 en Salón (1–35) y 10 en Terraza (36–45). Tomar pedido,
  enviar a cocina (imprime comanda), pedir cuenta, cobrar.
- **Mostrador**: pedidos sin mesa asignada, listado de en curso/cerradas.
- **Pedidos web**: escucha los pedidos hechos desde el menú online — alerta
  sonora + aviso en pantalla al llegar uno nuevo. Confirmar con tiempo
  estimado (15/30/45 min) abre WhatsApp con el mensaje ya armado para el
  cliente, o rechazar.
- **Productos** (ícono en la barra superior): activar/pausar platos, marcar
  "sin stock" (se ve gris con la etiqueta, igual que en Fudo, pero no se
  puede pedir) y editar precios en vivo — se reflejan al instante en Mesas y
  en el menú público.
- **Cobro**: Efectivo, Transferencia o Cta. Cte. (busca entre los clientes
  reales con cuenta corriente, descuenta el saldo y deja registro en el
  historial).
- **Comandas**: "Enviar a cocina" abre un ticket imprimible (80mm),
  separado en BARRA (bebidas) y COCINA (el resto), que se imprime solo.
- **Caja** (ícono en la barra superior): apertura de turno con el monto
  inicial, ventas acumuladas en vivo por medio de pago (Efectivo,
  Transferencia, Cta. Cte.) y el total esperado en caja. Al cerrar el turno
  pide el monto contado real y calcula la diferencia contra lo esperado;
  queda un historial de los últimos turnos cerrados.
- **Reportes** (ícono en la barra superior): ventas por período (hoy, ayer,
  esta semana, este mes o un rango de fechas a elección) — total vendido,
  cantidad de pedidos, ticket promedio, desglose por medio de pago,
  productos más vendidos, ventas por categoría y el detalle de cada venta
  cerrada (hora, mesa/mostrador, cliente, medio de pago, total).
- **Reservas**: escucha las reservas hechas desde el sitio público — alerta
  sonora + aviso en pantalla al llegar una nueva. Confirmar o rechazar abre
  WhatsApp con el mensaje ya armado para el cliente.
- **Cocina (KDS)** — `/admin/kds`: pantalla pensada para quedar abierta en
  una PC/TV de la cocina (se abre en pestaña aparte desde el ícono de la
  barra superior). Unifica en un solo tablero los pedidos de Mesa/Mostrador
  enviados a cocina y los pedidos web confirmados, con tres columnas
  (Pendiente/En preparación/Listo), alerta sonora al entrar uno nuevo, y
  temporizador desde que se mandó a cocina.
- Placeholders (todavía no construidos): Delivery, Mostrador express,
  Stock, Gastos.

## Modo local / offline

La versión de Vercel (Postgres) es la que se usa siempre que hay internet, y
no cambia en nada. Además, la PC del local puede correr una copia propia de
la app con su propia base de datos (`maderosys.db`, un archivo SQLite en la
misma carpeta) para seguir operando Mesas, comandas y Cobro si se corta
internet.

**Uso diario:** doble clic en `start-local.bat`. Arma la app (la primera vez
tarda un poco más porque instala dependencias) y abre sola
`http://localhost:3000/admin` en el navegador. No hay que tocar nada de
configuración: al no encontrar `DATABASE_URL`, la app arranca sola en modo
local con SQLite. No cerrar la ventana negra del servidor mientras se
trabaja; al terminar el día se pueden cerrar las dos ventanas.

**Cómo funciona por dentro:**

- Qué base usar se decide sola, según el entorno: si existe `DATABASE_URL`
  usa Postgres (Vercel); si no, y no está corriendo en Vercel, usa
  `maderosys.db` (SQLite) en la carpeta del proyecto.
- `maderosys.db` se auto-configura la primera vez que se usa, igual que pasa
  hoy con Postgres: crea las tablas y carga el catálogo real.
- Es una base **aparte** de la de Vercel — lo que se carga en la PC local no
  sube a la nube ni se mezcla con lo del sitio online. Sirve para no perder
  el día si se corta internet, no para sincronizar ambas.
- El archivo `maderosys.db` (y sus archivos auxiliares `-shm`/`-wal`) no se
  suben al repositorio (están en `.gitignore`).

## Marca

Logo real de Madero Restó en `public/logo-dark.png` (blanco, para fondos
oscuros — sitio público) y `public/logo-light.png` (negro, para fondos
claros — panel `/admin`). El favicon (`app/icon.png`) y los íconos de la
PWA (`public/icons/`) salen del trébol recortado del mismo logo.

## Pendiente

- `data/ingredientes.csv` y `data/proveedores.json` quedan guardados para
  los futuros módulos de Stock y Gastos.
