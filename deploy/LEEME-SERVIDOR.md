# MaderoSys en un servidor propio (guía para quien lo instala)

MaderoSys es un sistema de gestión para un restaurante (mesas, caja, pedidos, cocina, menú online, reservas,
fidelidad). Esta carpeta lo deja corriendo en **una máquina virtual Linux** con tres contenedores:

| Contenedor | Para qué |
|---|---|
| `app` | El sistema (Next.js 14 / Node 22), puerto interno 3000 |
| `db` | Base de datos PostgreSQL 17 (datos en un volumen Docker) |
| `caddy` | Candado HTTPS automático (Let's Encrypt) y entrada en los puertos 80/443 |

Todo se maneja con `docker compose`. No hace falta instalar Node ni PostgreSQL en la máquina.

## 1. Qué se necesita

- Una máquina virtual con **Debian 12 o Ubuntu 22.04/24.04**, **2 vCPU, 2 GB de RAM, 20 GB de disco** (alcanza de sobra).
- **IP pública** (mejor fija) con los puertos **80 y 443** abiertos hacia esa máquina. El 5432 (base de datos) **no** se abre.
- Un **nombre de dominio o subdominio** (ej. `madero.tudominio.com.ar`) con un registro DNS tipo **A** hacia la IP pública.
  Sin dominio se puede probar por `http://IP` (ver "Prueba rápida"), pero para usarlo en serio hace falta el nombre: es lo que da el candado HTTPS.
- Salida a internet (para bajar el código, las imágenes de Docker y los certificados).
- Idealmente: UPS / respaldo de energía para esa máquina, y un lugar **fuera de la máquina** donde guardar las copias de seguridad.

## 2. Instalación (una sola vez)

```bash
# 2.1 Docker (si no está)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER     # cerrar sesión y volver a entrar

# 2.2 El código
sudo mkdir -p /opt/maderosys && sudo chown $USER /opt/maderosys
git clone https://github.com/herfont1414-pixel/faltaun-.git /opt/maderosys
cd /opt/maderosys/deploy

# 2.3 Configuración
cp .env.ejemplo .env
nano .env        # completar DOMINIO, MENU_URL, DB_CLAVE (openssl rand -hex 24) y ADMIN_PIN (4 números)

# 2.4 Levantar todo (la primera vez tarda unos minutos en construir)
docker compose up -d --build
docker compose ps            # los tres deben decir "running" / "healthy"
docker compose logs -f app   # ver el arranque (Ctrl+C para salir)
```

Al entrar a `https://DOMINIO/admin` pide un PIN de 4 números: el `ADMIN_PIN` del `.env` es el del primer usuario administrador
(solo se usa si la base está vacía; si se traen los datos de la base anterior, los usuarios vienen con ella).
Después, desde el panel (Usuarios), se crean los demás.

El certificado HTTPS lo pide Caddy solo la primera vez que alguien entra al dominio; si el DNS todavía no apunta bien, falla y reintenta
(`docker compose logs caddy`).

### Prueba rápida sin dominio
En `.env`: `DOMINIO=:80` y `COOKIE_SECURE=false`; después `docker compose up -d --build` y entrar a `http://IP-DE-LA-MAQUINA/admin`.
**Es solo para probar dentro de la red; no usarlo así en producción** (sin candado el PIN viaja sin cifrar).

## 3. Traer los datos de la base anterior (una sola vez)

Los datos actuales (ventas, clientes, fidelidad, pedidos web) están en una base PostgreSQL en la nube. El dueño te pasa su dirección
(`postgres://usuario:clave@host:5432/postgres?sslmode=require`). **No la guardes en ningún archivo ni la pegues en chats.**

```bash
cd /opt/maderosys/deploy
./traer-datos.sh "postgres://...dirección entre comillas..."
```

Reemplaza lo que haya en este servidor por una copia exacta de la base anterior (usa `pg_dump` dentro de un contenedor). Hacerlo **antes** de
empezar a usar el servidor.

## 4. Copias de seguridad (importante)

Los datos del restaurante pasan a vivir **solo acá**: sin copias, si la máquina falla se pierde todo.

```bash
./backup.sh           # copia ahora: deploy/backups/maderosys-AAAA-MM-DD_HHMM.sql.gz (guarda 30 días)
```

Programar cada 6 horas (`crontab -e`):

```
0 */6 * * * /opt/maderosys/deploy/backup.sh >> /var/log/maderosys-backup.log 2>&1
```

**Copia fuera de la máquina** (recomendado): en `.env` agregar `COPIA_REMOTA="usuario@otro-equipo:/ruta/backups/"` (rsync por SSH, con
clave sin contraseña) o sincronizar `deploy/backups/` con lo que ya use para sus respaldos. Probar una restauración de vez en cuando.

Restaurar una copia (**reemplaza** los datos actuales; pide confirmación):

```bash
./restore.sh backups/maderosys-2026-10-28_0400.sql.gz
```

## 5. Actualizar a una versión nueva

```bash
cd /opt/maderosys/deploy && ./actualizar.sh
```

Hace una copia, baja el código (`git pull`), reconstruye y reinicia. Los datos no se tocan; el sistema crea solo las columnas nuevas que
haga falta. Si algo sale mal: `git log` para ver la versión anterior, `git checkout <commit>` y `docker compose up -d --build`; y si hiciera falta,
`./restore.sh` con la copia que se hizo justo antes.

## 6. Seguridad

- Solo se exponen **80 y 443**. La base escucha únicamente en `127.0.0.1` (la propia máquina). Verificar con `ss -tlnp` y el firewall (`ufw allow 80,443/tcp`, `ufw allow 22/tcp`, `ufw enable`).
- Caddy reescribe `X-Real-IP` / `X-Forwarded-For` con la IP real de cada visitante: la aplicación las usa para limitar intentos de PIN y pedidos.
  **No poner otro proxy delante sin ajustar eso** (se podría falsear la IP y saltear el límite).
- `.env` contiene la clave de la base: permisos `chmod 600 .env`, y no subirlo a ningún repositorio.
- Mantener el sistema operativo actualizado (`unattended-upgrades`) y SSH solo con clave.

## 7. Comandos útiles

```bash
docker compose ps                  # estado
docker compose logs --tail=100 app # últimos mensajes del sistema
docker compose restart app         # reiniciar solo la aplicación
docker compose exec db psql -U maderosys maderosys   # consola de la base (solo lectura recomendada)
df -h; docker system df            # espacio
```

Si el servidor se reinicia, los contenedores arrancan solos (`restart: unless-stopped`).

## 8. Qué probar después de instalar

1. `https://DOMINIO/` muestra el menú online, y `https://DOMINIO/admin` pide PIN.
2. Entrar al panel, abrir una mesa, agregar un producto, cobrar.
3. Hacer un pedido de prueba desde el menú online (desde un celular, con datos móviles): tiene que aparecer en **Pedidos web**.
4. `./backup.sh` y verificar que crea el archivo; `docker compose restart` y comprobar que todo vuelve solo.

## 9. Impresora de la caja

La impresión **directa** (sin ventana, para la térmica USB) hoy la hace el programa que corre en la PC de la caja (Windows). Con el servidor en
otra máquina, la caja entra al panel por el navegador y la comanda se imprime con el diálogo normal del navegador hasta que se agregue
un "agente de impresión" (pendiente de desarrollo). Esto **no** afecta al servidor.
