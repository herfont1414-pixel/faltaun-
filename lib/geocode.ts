// Búsqueda de direcciones con OpenStreetMap (Nominatim), gratis y sin clave.
// Todo pasa por nuestro servidor para cumplir la política de uso de Nominatim:
// identificarse con un User-Agent, no más de 1 consulta por segundo y guardar
// resultados repetidos en memoria.
import { isValidLatLng, type LatLng } from "@/lib/geo";

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "MaderoSys/1.0 (restaurante; https://madero14.vercel.app)";
const MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

const cache = new Map<string, { at: number; value: GeocodeResult[] }>();
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

// Las consultas salen de a una y con al menos 1,1 s de separación.
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function cached(key: string, load: () => Promise<GeocodeResult[]>): Promise<GeocodeResult[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await throttled(load);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function nominatim(path: string): Promise<any> {
  const res = await fetch(`${NOMINATIM}${path}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);
  return res.json();
}

export function clearGeocodeCache() {
  cache.clear();
}

// near: el local. Se usa para priorizar resultados cercanos (no los limita).
export async function searchAddress(query: string, near?: LatLng | null): Promise<GeocodeResult[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < 3) return [];
  const params = new URLSearchParams({ format: "jsonv2", limit: "5", countrycodes: "ar", q });
  if (near && isValidLatLng(near.lat, near.lng)) {
    const d = 0.5;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  return cached(`s:${params.toString()}`, async () => {
    const data = (await nominatim(`/search?${params}`)) as { display_name: string; lat: string; lon: string }[];
    return data
      .map((r) => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }))
      .filter((r) => isValidLatLng(r.lat, r.lng));
  });
}

export async function reverseAddress(point: LatLng): Promise<GeocodeResult | null> {
  if (!isValidLatLng(point.lat, point.lng)) return null;
  const lat = point.lat.toFixed(5);
  const lng = point.lng.toFixed(5);
  const results = await cached(`r:${lat},${lng}`, async () => {
    const data = (await nominatim(`/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`)) as {
      display_name?: string;
    };
    return data.display_name ? [{ label: data.display_name, lat: point.lat, lng: point.lng }] : [];
  });
  return results[0] ?? null;
}
