// Caché de lecturas de vida corta, en la memoria del servidor.
//
// Las pantallas del panel se actualizan solas cada pocos segundos (mesas, pedidos, cocina,
// pedidos web…). Con la base en la nube cada consulta cuenta: sin caché, una sola pantalla
// abierta gastaba ~8 consultas cada 5 segundos y el plan de la base llegó a su tope. Acá las
// lecturas repetidas se responden desde memoria y se vuelve a consultar solo si pasó el
// tiempo (TTL) o si alguien ESCRIBIÓ en las tablas de las que depende (db.ts avisa cada
// escritura): nunca se muestra algo viejo después de un cambio hecho en este servidor.
// Los cambios hechos desde otro servidor (la PC de la caja y la web son dos procesos) se ven
// como máximo cuando vence el TTL.

interface Entry {
  at: number;
  value: unknown;
  tags: string[];
}

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
// Sube con cada invalidación: una carga que empezó antes de una escritura no se guarda.
let epoch = 0;

export async function cached<T>(key: string, ttlMs: number, tags: string[], load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const startedAt = epoch;
  const promise = load()
    .then((value) => {
      if (epoch === startedAt) entries.set(key, { at: Date.now(), value, tags });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/** Descarta lo guardado que dependa de alguna de estas tablas (o todo, si no se indican). */
export function invalidateReads(tables?: string[]) {
  epoch += 1;
  if (!tables || tables.length === 0) {
    entries.clear();
    return;
  }
  const touched = new Set(tables);
  for (const [key, entry] of entries) {
    if (entry.tags.some((t) => touched.has(t))) entries.delete(key);
  }
}

const WRITE = /^\s*(insert|update|delete|alter|create|drop|truncate|commit|with\b[\s\S]*\b(insert|update|delete)\b)/i;

/** Lo llama db.ts después de cada consulta: si fue una escritura, invalida lo que dependía de ella. */
export function noteQuery(sql: unknown) {
  if (typeof sql !== "string" || !WRITE.test(sql)) return;
  const tables = sql.toLowerCase().match(/gestion_[a-z_]+/g);
  // "commit" (o un script sin tablas): no se sabe qué cambió, se descarta todo.
  invalidateReads(/^\s*commit/i.test(sql) ? undefined : tables ?? undefined);
}

/** Solo para tests. */
export function resetReadCache() {
  entries.clear();
  inflight.clear();
  epoch += 1;
}
