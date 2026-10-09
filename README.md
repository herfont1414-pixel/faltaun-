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
- `ADMIN_PIN`: PIN de 4 dígitos para el primer ingreso a `/admin`. Solo se usa
  para crear automáticamente un usuario "Administrador" la primera vez que la
  base de datos está vacía (así no hace falta configurar nada a mano para
  empezar). Desde ahí, los usuarios y sus PIN se manejan desde `/admin` →
  Usuarios: cada persona tiene su propio PIN (hasheado, nunca en texto
  plano) y un rol (admin/encargado/mozo/cocina).
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

- Menú en grilla (2-3 columnas), filtrable por categorías en pills
  horizontales, cargado directo desde la base (mismo catálogo que usa el
  panel interno). Cada plato abre una ficha con selector de cantidad antes
  de agregarlo al carrito.
- Carrito flotante con el total, que se expande en un modal de checkout:
  ahí el cliente elige **Retirar en el local** o **Delivery** (con
  dirección, zona y costo de envío ya sumado al total — mismas zonas que
  administra el panel). Al escribir el teléfono, si ya pidió antes
  autocompleta nombre y dirección. Al confirmar, el pedido se guarda en la
  base **y además** se abre WhatsApp hacia el local con el resumen del
  pedido ya armado (productos, modalidad, dirección/horario y total) para
  que el cliente solo tenga que mandar el mensaje. El pedido llega en vivo
  al panel `/admin` → Pedidos web.
- **Mis pedidos** (ícono en el header): historial de pedidos del cliente
  por teléfono.
- **Tarjeta de fidelidad** (ícono en el header, lleva a `/fidelidad`):
  tarjeta virtual por teléfono que suma un sello cada vez que el local
  confirma un pedido (desde el menú o cobrando en el panel) — cada 10
  sellos se gana un premio (a canjear mostrando la tarjeta en el local).
  También muestra la cantidad de pedidos y el total acumulado gastado.
- Reservas: pide fecha, horario, personas, nombre y WhatsApp, y queda
  guardada en la base — llega en vivo al panel `/admin` → Reservas.

## Panel interno — `/admin`

Protegido por PIN (teclado numérico en `/admin/login`): cada persona tiene su
propio PIN y rol (admin/encargado/mozo/cocina), gestionables desde **Usuarios**.
El PIN nunca se guarda en texto plano ni se usa como sesión — al entrar se crea
un token de sesión aparte, que es lo que queda en la cookie del navegador.

- **Inicio** (ícono de casa): dashboard con ventas del día, mesas
  ocupadas/libres, pedidos web y reservas pendientes, y accesos rápidos.
- **Mesas**: 35 en Salón (1–35) y 10 en Terraza (36–45), como tarjetas con
  su estado (Libre/Ocupada/Pidió cuenta/Cobrando) bien visible. Tomar
  pedido, enviar a cocina (imprime comanda), pedir cuenta, cobrar.
- **Mostrador**: pedidos sin mesa asignada, listado de en curso/cerradas.
- **Pedidos web**: escucha los pedidos hechos desde el menú online — alerta
  sonora + aviso en pantalla al llegar uno nuevo. **Aceptar** abre un
  modal para elegir el tiempo estimado (15/30/45/60 min) y manda ese
  tiempo al cliente por WhatsApp ya armado. **Rechazar** abre un modal
  para elegir el motivo (Sin stock, Fuera de zona, Horario de cierre,
  Otro) y también le manda el motivo al cliente por WhatsApp.
- Al cobrar (Mesas/Mostrador/Delivery) se puede cargar un **teléfono de
  fidelidad** opcional en el modal de pago: suma un sello silenciosamente
  y actualiza la cantidad de pedidos y el total gastado de ese cliente.
- **Productos** (ícono en la barra superior): activar/pausar platos, marcar
  "sin stock" (se ve gris con la etiqueta, igual que en Fudo, pero no se
  puede pedir) y editar precios en vivo — se reflejan al instante en Mesas y
  en el menú público. Además se le puede asignar un **stock numérico** a
  cualquier producto (dejar vacío = stock infinito, sin controlarlo): se
  descuenta solo con cada venta confirmada, y al llegar a 0 el producto pasa
  a "sin stock" automáticamente, sin tener que tocar nada a mano.
- **Cobro**: Efectivo, Transferencia o Cta. Cte. (busca entre los clientes
  reales con cuenta corriente, descuenta el saldo y deja registro en el
  historial).
- **Comandas**: "Enviar a cocina" abre un ticket imprimible (80mm),
  separado en BARRA (bebidas) y COCINA (el resto), que se imprime solo.
- **Gastos** (ícono en la barra superior): registro rápido de salidas de
  dinero de la caja (ej. "Pago a proveedor", "Compra de hielo") — concepto,
  monto y medio de pago (efectivo/transferencia), con el total gastado hoy
  siempre visible.
- **Caja** (ícono en la barra superior): apertura de turno con el monto
  inicial, ventas acumuladas en vivo por medio de pago (Efectivo,
  Transferencia, Cta. Cte.), **gastos en efectivo** del turno, y el total
  esperado en caja (inicial + ventas en efectivo − gastos en efectivo). Al
  cerrar el turno pide el monto contado real y calcula la diferencia contra
  lo esperado; queda un historial de los últimos turnos cerrados.
- **Reportes** (ícono en la barra superior): ventas por período (hoy, ayer,
  esta semana, este mes o un rango de fechas a elección) — total vendido,
  cantidad de pedidos, ticket promedio, desglose por medio de pago, total
  de gastos y neto (ventas − gastos), productos más vendidos, ventas por
  categoría y el detalle de cada venta cerrada (hora, mesa/mostrador,
  cliente, medio de pago, total).
- **Reservas**: escucha las reservas hechas desde el sitio público — alerta
  sonora + aviso en pantalla al llegar una nueva. Confirmar o rechazar abre
  WhatsApp con el mensaje ya armado para el cliente.
- **Cocina (KDS)** — `/admin/kds`: pantalla pensada para quedar abierta en
  una PC/TV de la cocina (se abre en pestaña aparte desde el ícono de la
  barra superior). Unifica en un solo tablero los pedidos de Mesa/Mostrador
  enviados a cocina y los pedidos web confirmados, con tres columnas
  (Pendiente/En preparación/Listo), alerta sonora al entrar uno nuevo, y
  temporizador desde que se mandó a cocina.
- **Delivery** (ícono "Delivery config" o pestaña "Delivery" en la barra
  superior): pedidos por teléfono/WhatsApp con nombre, teléfono y dirección
  del cliente — al repetir el teléfono de un pedido anterior autocompleta
  nombre y dirección. Costo de envío configurable por zona (sección "Zonas
  de envío"), que se suma solo al total del pedido. Reutiliza el mismo
  panel de productos/comanda/cobro que Mesas y Mostrador, y suma un estado
  de reparto propio (Preparando / En camino / Entregado) visible en el
  panel del pedido. Internamente es un pedido de mostrador marcado como
  delivery, así que no se mezcla con el listado de Mostrador ni afecta la
  numeración de mesas.
- **Mostrador Express**: venta rápida sin categorías — una sola grilla
  plana con todos los productos activos. Internamente crea un pedido de
  mostrador igual que "Mostrador" (misma lista de ventas en curso/
  cerradas), solo cambia la forma de armarlo: menos clics para una venta
  de uno o dos productos.
- **Clientes**: lista unificada por teléfono que junta en una sola fila
  lo que haya en fidelidad (pedidos, gastado, sellos), datos de delivery
  (dirección) y cuenta corriente heredada de Fudo (saldo), sin duplicar
  tablas. Buscador por nombre/teléfono y detalle con el historial de
  pedidos del menú online de cada cliente.
- **Impresión**: reemplaza el heurístico fijo que mandaba todo lo de la
  categoría "Bebidas" a Barra y el resto a Cocina. Ahora las áreas de
  impresión (Barra, Cocina, y las que se agreguen) se gestionan acá, y
  cada producto se le asigna un área desde **Productos** — la comanda
  imprimible agrupa según esa asignación (un producto sin asignar cae en
  el heurístico viejo, para no perder nada mientras se clasifica la
  carta).
- **Usuarios**: alta/baja de usuarios y reseteo de PIN, uno por persona, con
  rol admin/encargado/mozo/cocina. Cada acción sensible (precios, caja,
  configuración, usuarios) se valida en el servidor según el rol — no es
  solamente una pantalla que se oculta. Siempre queda al menos un
  administrador activo.

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

### Lanzador de un clic, actualización automática y base compartida

`MaderoSys-Iniciar.bat` reemplaza a `start-local.bat` para el uso diario:

- **Se actualiza solo.** Antes de arrancar, `scripts/actualizar.mjs` baja la última
  versión de `main` desde GitHub y la aplica **sin tocar** `.env.local` (PIN y
  configuración), `maderosys.db` (datos locales) ni `node_modules`. No actualiza si el
  servidor ya está abierto y, si no hay internet o algo falla, sigue con la versión
  instalada. Si cambian los componentes (`package-lock.json`) los reinstala solo.
- **Base de datos.** La primera vez pregunta (`scripts/configurar-base.mjs`) si se
  quiere usar **la misma base que Vercel** (se pega su `DATABASE_URL` una vez; queda en
  `.env.local`, que no se sube a GitHub) o la base local de esta PC (solo Enter). Con la
  base compartida, el panel de la PC y el de Vercel muestran los mismos datos; la
  impresión directa sigue saliendo por el servidor local de Windows.
- **Sin internet:** `MaderoSys-Iniciar-SIN-INTERNET.bat` arranca con la base local de la
  PC. Lo que se cargue ahí **no** aparece en Vercel, y viceversa.

### Inicio automático con Windows

La primera vez que se abre `MaderoSys-Iniciar.bat` después de actualizar, deja instalado un
acceso en la carpeta *Inicio* de Windows (`scripts/autoinicio.mjs` crea
`MaderoSys-Autoinicio.vbs`). Desde entonces, al encender la PC e iniciar sesión, el lanzador
corre solo en una ventana **minimizada**: se actualiza, arma la aplicación si hace falta y
levanta el servidor, **sin abrir el navegador** (`MADERO_AUTO=1`). Al abrir
`http://localhost:3000` ya está funcionando. Después de una actualización con cambios el
armado puede tardar unos minutos antes de que responda.

- Windows tiene que iniciar sesión solo (sin pedir contraseña) para que arranque sin que nadie
  toque la PC.
- **No cierres** la ventana minimizada "MaderoSys - Servidor".
- Para quitarlo: `MaderoSys-Quitar-Inicio-Automatico.bat` (deja un archivo
  `.sin-inicio-automatico`; borrarlo y abrir el lanzador lo vuelve a activar).

### Impresión directa (ESC/POS) en modo local

En `/admin` → **Impresión** hay una sección "Impresión directa (ESC/POS)" que,
una vez activada, hace que "Enviar a cocina" y "Imprimir" manden el ticket
directo a la impresora térmica conectada por USB a esta PC, sin ningún
diálogo de impresión del navegador. Solo tiene efecto corriendo en modo
local (`start-local.bat`) **y en Windows**: contra el sitio de Vercel, o en
cualquier otro sistema operativo, el botón sigue abriendo el flujo normal
del navegador (igual que si la opción estuviera desactivada) — no hay forma
de que un servidor en la nube le hable a un USB físico del local.

Para activarla:

1. Confirmá el nombre exacto de la impresora en Windows → **Dispositivos e
   impresoras** (en este caso, algo como `POS-58-Series`).
2. En `/admin` → Impresión → Impresión directa, activala y cargá ese
   nombre tal cual.

No hace falta compartir la impresora ni cambiarle el driver: el sistema le
manda los bytes crudos directamente vía la API de impresión de Windows
(`winspool.drv`, con el script `scripts/print-raw.ps1`), usando la
impresora exactamente como Windows ya la tiene instalada.

Los tickets se imprimen sin tildes ni Ñ a propósito: la mayoría de las
impresoras térmicas genéricas vienen con una página de códigos que no las
tiene, y es mejor que se lean bien a arriesgarse a que salgan caracteres
sueltos. El logo del ticket final usa el nombre del local en letra grande
en vez de una imagen — imprimir el logo real como bitmap necesitaría
convertirlo a blanco y negro ajustado al ancho del rollo, algo que hay que
afinar contra la impresora física, no a ciegas.

## Marca

Logo real de Madero Restó en `public/logo-dark.png` (blanco, para fondos
oscuros — sitio público) y `public/logo-light.png` (negro, para fondos
claros — panel `/admin`). El favicon (`app/icon.png`) y los íconos de la
PWA (`public/icons/`) salen del trébol recortado del mismo logo.

## Pendiente

- `data/ingredientes.csv` y `data/proveedores.json` quedan guardados para
  los futuros módulos de Stock y Gastos.
- Tabla de preparación ya creada en la base pero todavía sin pantalla en
  el panel: `gestion_payment_methods` (medios de pago configurables).
  `gestion_afip_config`, `gestion_business_config` y `gestion_print_config`
  ya tienen pantalla — ver "Configuración" e "Impresión" arriba.
- La impresión directa (ESC/POS) está construida y probada en todo lo que
  se puede verificar sin el hardware real (generación de los bytes,
  fallback al flujo normal cuando no corresponde), pero falta la prueba
  final contra la impresora física — ver la sección de arriba.

## Envío por distancia (mapa de OpenStreetMap)

En **Delivery → Zonas de envío** se marca la ubicación del local en el mapa y se cargan zonas con "Hasta (km)"
(por ejemplo hasta 2 km $1.500, hasta 5 km $3.000). En el menú online el cliente escribe su dirección, toca
"Ubicar en el mapa" (o ajusta el pin) y ve la distancia y el costo. El precio lo recalcula siempre el servidor;
la distancia es en línea recta. Las zonas sin kilómetros siguen siendo zonas por nombre. Usa OpenStreetMap
(Leaflet + Nominatim): no necesita claves ni tarjeta. Las búsquedas pasan por `/api/geocode`, que respeta el
límite de 1 consulta por segundo de Nominatim.
