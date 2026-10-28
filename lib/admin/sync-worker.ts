// Ciclo de la PC del local con la nube (ver sync.ts para qué viaja y en qué sentido).
// Se activa solo si hay CLOUD_SYNC_URL y SYNC_TOKEN (en .env.local de la PC). Cada ~30 s, mientras
// la PC está prendida: manda lo que cambió, baja los pedidos web y reservas nuevos y los guarda.
import type { Db } from "@/lib/admin/db";
import {
  applyInbox,
  changedTables,
  contentHash,
  emptyRequest,
  readPublishable,
  readTracking,
  type Row,
  type SyncRequest,
  type SyncResponse,
} from "@/lib/admin/sync";
import { popularProductNames } from "@/lib/menu";

const HASH_PREFIX = "sync_hash:";
const ACK_KEY = "sync_pending_ack";
const TRACK_KEY = "sync_tracking_hashes";
// Se informa el estado de los pedidos web de los últimos días.
const TRACKING_DAYS = 3;

async function readMeta(db: Db, key: string): Promise<string | null> {
  const { rows } = await db.query<{ value: string | null }>("select value from gestion_meta where key = $1", [key]);
  return rows[0]?.value ?? null;
}

async function writeMeta(db: Db, key: string, value: string) {
  await db.query("insert into gestion_meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, value]);
}

export interface SyncOutcome {
  sentTables: string[];
  trackingSent: number;
  received: { web: number; reserva: number };
}

/**
 * Una vuelta completa. `send` lleva el pedido a la nube y devuelve su respuesta (en producción es
 * un POST por HTTPS; en las pruebas llama directo al código de la nube). Si algo falla, no se
 * guarda ningún avance: la próxima vuelta reintenta todo igual.
 */
export async function syncOnce(
  db: Db,
  send: (request: SyncRequest) => Promise<SyncResponse>,
  options: { now?: Date; popularNames?: string[] } = {}
): Promise<SyncOutcome> {
  const now = options.now ?? new Date();
  const popular = options.popularNames ?? (await popularProductNames(db));
  const current = await readPublishable(db, popular);

  const { rows: hashRows } = await db.query<{ key: string; value: string | null }>(
    "select key, value from gestion_meta where key like $1",
    [`${HASH_PREFIX}%`]
  );
  const sentHashes: Record<string, string> = {};
  for (const r of hashRows) sentHashes[r.key.slice(HASH_PREFIX.length)] = r.value ?? "";
  const toSend = changedTables(current, sentHashes);

  const tracking = await readTracking(db, new Date(now.getTime() - TRACKING_DAYS * 86_400_000));
  const trackingHashes: Record<string, string> = safeJson(await readMeta(db, TRACK_KEY)) ?? {};
  const trackingNow: Record<string, string> = {};
  const trackingChanged: Row[] = [];
  for (const row of tracking) {
    const h = contentHash(row);
    trackingNow[String(row.id)] = h;
    if (trackingHashes[String(row.id)] !== h) trackingChanged.push(row);
  }

  const request = emptyRequest();
  request.ack = safeJson(await readMeta(db, ACK_KEY)) ?? request.ack;
  for (const name of toSend) request.publish[name] = current[name];
  request.tracking = trackingChanged;

  const response = await send(request);

  // La nube lo recibió: recién ahora se recuerda qué se mandó.
  for (const name of toSend) await writeMeta(db, HASH_PREFIX + name, contentHash(current[name]));
  if (trackingChanged.length > 0 || Object.keys(trackingHashes).length !== Object.keys(trackingNow).length) {
    await writeMeta(db, TRACK_KEY, JSON.stringify(trackingNow));
  }

  // Lo que bajó se guarda en la base de la PC y se confirma en la vuelta siguiente.
  const done = await applyInbox(db, response.inbox ?? { web: [], reserva: [] });
  await writeMeta(db, ACK_KEY, JSON.stringify(done));

  return { sentTables: toSend, trackingSent: trackingChanged.length, received: { web: done.web.length, reserva: done.reserva.length } };
}

function safeJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Ciclo automático (solo en la PC, dentro del proceso del servidor)
// ---------------------------------------------------------------------------------------------

export interface SyncStatus {
  enabled: boolean;
  lastOkAt: number | null;
  lastError: string | null;
  last: SyncOutcome | null;
}

const globalForSync = globalThis as unknown as { __syncStatus?: SyncStatus; __syncStarted?: boolean };

export function getSyncStatus(): SyncStatus {
  return globalForSync.__syncStatus ?? { enabled: false, lastOkAt: null, lastError: null, last: null };
}

let popularCache: { at: number; names: string[] } | null = null;

export async function postToCloud(baseUrl: string, token: string, request: SyncRequest): Promise<SyncResponse> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("La nube no aceptó la clave de conexión (SYNC_TOKEN)");
  if (!res.ok) throw new Error(`La nube respondió ${res.status}`);
  const data = (await res.json()) as SyncResponse;
  if (!data?.ok) throw new Error("Respuesta inesperada de la nube");
  return data;
}

export function startSyncLoop(getDb: () => Promise<Db>) {
  const url = process.env.CLOUD_SYNC_URL?.trim();
  const token = process.env.SYNC_TOKEN?.trim();
  if (!url || !token || globalForSync.__syncStarted) return;
  globalForSync.__syncStarted = true;
  const intervalMs = Math.max(10, Number(process.env.SYNC_INTERVAL_SECONDS) || 30) * 1000;
  const status: SyncStatus = { enabled: true, lastOkAt: null, lastError: null, last: null };
  globalForSync.__syncStatus = status;

  async function tick() {
    try {
      const db = await getDb();
      // El ranking de "más pedidos" es una consulta grande: se recalcula cada 5 minutos.
      if (!popularCache || Date.now() - popularCache.at > 300_000) popularCache = { at: Date.now(), names: await popularProductNames(db) };
      status.last = await syncOnce(db, (request) => postToCloud(url!, token!, request), { popularNames: popularCache.names });
      status.lastOkAt = Date.now();
      status.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== status.lastError) console.warn(`[nube] No se pudo sincronizar: ${message}`);
      status.lastError = message;
    } finally {
      setTimeout(tick, intervalMs).unref?.();
    }
  }
  setTimeout(tick, 5_000).unref?.();
}
