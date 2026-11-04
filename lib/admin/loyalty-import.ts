import { getPool } from "@/lib/admin/db";
import { recordAudit } from "@/lib/admin/auth";
import { resolveLoyaltyPhone } from "@/lib/admin/loyalty";

// Carga a mano de sellos de fidelidad que los clientes ya tenían (por ejemplo, al pasar
// a la base de la PC sin poder copiar la anterior). Se pega una lista, una línea por
// cliente:  Nombre; Teléfono; Sellos; Gastado (opcional)
//
// Reglas:
//  - Deja la cuenta EN esa cantidad de sellos (no suma): cargar la misma lista dos veces
//    no duplica nada. Si la cuenta ya tiene esos sellos o más, no se toca (nunca resta).
//  - NO genera premios: no hay premios retroactivos; los hitos se premian solo cuando un
//    sello nuevo los cruza.
//  - Queda registrado como transacción 'import' (no cuenta como sello dado por un empleado
//    ni para el tope diario) y en la auditoría, con quién lo cargó.

export interface StampImportRow {
  line: number;
  name: string | null;
  phone: string;
  stamps: number;
  spent: number | null;
}

export interface StampImportResult {
  phone: string;
  name: string | null;
  before: number;
  after: number;
  status: "nuevo" | "actualizado" | "sin_cambios";
}

const MAX_ROWS = 500;
const MAX_STAMPS = 500;

function parseMoney(raw: string): number | null {
  const s = raw.replace(/[$\s]/g, "");
  if (!s) return null;
  // Formato argentino: punto de miles y coma decimal ("15.600" / "15.600,50").
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function parseStampList(text: string): { rows: StampImportRow[]; errors: string[] } {
  const rows: StampImportRow[] = [];
  const errors: string[] = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cols = raw.split(/[;\t]/).map((c) => c.trim());
    if (cols.length < 3) {
      errors.push(`Línea ${line}: faltan datos (Nombre; Teléfono; Sellos).`);
      return;
    }
    const [name, phone, stampsRaw, spentRaw = ""] = cols;
    // Encabezado opcional ("Nombre; Teléfono; Sellos").
    if (rows.length === 0 && errors.length === 0 && !/\d/.test(stampsRaw)) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) {
      errors.push(`Línea ${line}: el teléfono "${phone}" no es válido.`);
      return;
    }
    const stamps = Number(stampsRaw);
    if (!Number.isInteger(stamps) || stamps < 0 || stamps > MAX_STAMPS) {
      errors.push(`Línea ${line}: los sellos tienen que ser un número entero entre 0 y ${MAX_STAMPS}.`);
      return;
    }
    const spent = parseMoney(spentRaw);
    if (Number.isNaN(spent)) {
      errors.push(`Línea ${line}: el gastado "${spentRaw}" no es un número.`);
      return;
    }
    rows.push({ line, name: name.replace(/\s+/g, " ") || null, phone: phone.trim(), stamps, spent });
  });
  if (rows.length > MAX_ROWS) errors.push(`Son demasiadas líneas (máximo ${MAX_ROWS}).`);
  return { rows, errors };
}

// dryRun: calcula lo que pasaría y no guarda nada (para revisar antes de confirmar).
export async function importStamps(
  text: string,
  userId: number | null,
  options: { dryRun?: boolean } = {}
): Promise<{ results: StampImportResult[]; errors: string[] }> {
  const { rows, errors } = parseStampList(text);
  if (errors.length) return { results: [], errors };
  if (!rows.length) return { results: [], errors: ["La lista está vacía."] };

  const client = await getPool().connect();
  const results: StampImportResult[] = [];
  try {
    await client.query("begin");
    const seen = new Map<string, number>();
    for (const row of rows) {
      const phone = await resolveLoyaltyPhone(client, row.phone);
      if (seen.has(phone)) {
        throw new Error(`Línea ${row.line}: el teléfono ${row.phone} ya está en la línea ${seen.get(phone)}.`);
      }
      seen.set(phone, row.line);
      const { rows: found } = await client.query<{ stamps: number; name: string | null; order_count: number; total_spent: string | number }>(
        "select stamps, name, order_count, total_spent from gestion_loyalty_accounts where phone = $1",
        [phone]
      );
      const existing = found[0];
      const before = existing ? Number(existing.stamps) : 0;
      const name = existing?.name || row.name;
      if (existing && before >= row.stamps) {
        results.push({ phone, name, before, after: before, status: "sin_cambios" });
        continue;
      }
      if (!existing && row.stamps === 0) {
        results.push({ phone, name, before: 0, after: 0, status: "sin_cambios" });
        continue;
      }
      const orderCount = Math.max(existing ? Number(existing.order_count) : 0, row.stamps);
      const spent = Math.max(existing ? Number(existing.total_spent) : 0, row.spent ?? 0);
      await client.query(
        `insert into gestion_loyalty_accounts (phone, stamps, name, order_count, total_spent, origin, updated_at)
         values ($1, $2, $3, $4, $5, 'carga_inicial', now())
         on conflict (phone) do update set
           stamps = excluded.stamps,
           name = coalesce(gestion_loyalty_accounts.name, excluded.name),
           order_count = excluded.order_count,
           total_spent = excluded.total_spent,
           updated_at = excluded.updated_at`,
        [phone, row.stamps, name, orderCount, spent]
      );
      await client.query(
        `insert into gestion_loyalty_transactions (phone, order_id, type, stamps, amount, stamp_day, user_id)
         values ($1, null, 'import', $2, 0, null, $3)`,
        [phone, row.stamps - before, userId]
      );
      results.push({ phone, name, before, after: row.stamps, status: existing ? "actualizado" : "nuevo" });
    }
    const changed = results.filter((r) => r.status !== "sin_cambios");
    if (changed.length) {
      await recordAudit({
        userId,
        action: "loyalty_import",
        entity: "loyalty",
        newValue: changed.map((r) => ({ telefono: r.phone, nombre: r.name, antes: r.before, despues: r.after })),
        client,
      });
    }
    await client.query(options.dryRun ? "rollback" : "commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if (error instanceof Error && error.message.startsWith("Línea ")) return { results: [], errors: [error.message] };
    throw error;
  } finally {
    client.release();
  }
  return { results, errors: [] };
}
