import { whatsappDigits } from "@/lib/phone";

// Cálculos puros del informe de fidelización (sin base de datos): reciben filas
// ya leídas y devuelven datos para mostrar. Nada de acá escribe ni corrige nada.

// Reglas nuevas aprobadas: papas en 5, 20, 35… y hamburguesa en 15, 30, 45…
export const PAPAS_FIRST = 5;
export const BURGER_FIRST = 15;
export const MILESTONE_STEP = 15;
// Regla del sistema anterior: un premio genérico cada 10 sellos.
export const LEGACY_THRESHOLD = 10;

export interface AccountRow {
  phone: string;
  name: string | null;
  stamps: number;
  redeemed: number;
  orderCount: number;
  totalSpent: number;
  origin: string | null;
  updatedAt: string | null;
}

// Transacciones de tipo 'stamp' agrupadas por teléfono.
export interface TxAggregate {
  phone: string;
  count: number;
  stampsSum: number;
}

export function milestones(stamps: number, first: number): number[] {
  const out: number[] = [];
  for (let m = first; m <= stamps; m += MILESTONE_STEP) out.push(m);
  return out;
}
export const papasMilestones = (stamps: number) => milestones(stamps, PAPAS_FIRST);
export const burgerMilestones = (stamps: number) => milestones(stamps, BURGER_FIRST);

// ---------- 1) Posibles premios retroactivos (reglas NUEVAS) ----------

export interface RetroRow {
  phone: string;
  name: string | null;
  stamps: number;
  papas: number;
  papasHitos: number[];
  burgers: number;
  burgerHitos: number[];
  total: number;
}

export interface RetroSection {
  rows: RetroRow[];
  clientsWithPapas: number;
  clientsWithBurger: number;
  clientsWithAny: number;
  totalPapas: number;
  totalBurgers: number;
  totalRewards: number;
}

export function computeRetroactive(accounts: AccountRow[]): RetroSection {
  const rows: RetroRow[] = [];
  for (const a of accounts) {
    const papasHitos = papasMilestones(a.stamps);
    const burgerHitos = burgerMilestones(a.stamps);
    if (papasHitos.length === 0 && burgerHitos.length === 0) continue;
    rows.push({
      phone: a.phone,
      name: a.name,
      stamps: a.stamps,
      papas: papasHitos.length,
      papasHitos,
      burgers: burgerHitos.length,
      burgerHitos,
      total: papasHitos.length + burgerHitos.length,
    });
  }
  rows.sort((x, y) => y.stamps - x.stamps || x.phone.localeCompare(y.phone));
  const totalPapas = rows.reduce((s, r) => s + r.papas, 0);
  const totalBurgers = rows.reduce((s, r) => s + r.burgers, 0);
  return {
    rows,
    clientsWithPapas: rows.filter((r) => r.papas > 0).length,
    clientsWithBurger: rows.filter((r) => r.burgers > 0).length,
    clientsWithAny: rows.length,
    totalPapas,
    totalBurgers,
    totalRewards: totalPapas + totalBurgers,
  };
}

// ---------- 2) Canjes registrados en el sistema anterior (NO equivalen a lo de arriba) ----------

export interface LegacyRow {
  phone: string;
  name: string | null;
  stamps: number;
  redeemed: number;
  // Cuántos premios habría dado la regla vieja (cada 10 sellos). Solo informativo.
  legacyEarned: number;
}

export interface LegacySection {
  totalRedeemed: number;
  accountsWithRedeemed: number;
  rows: LegacyRow[];
  // Informativo: premios "de a 10 sellos" que la regla vieja habría dado en total.
  legacyEarnedTotal: number;
}

export function computeLegacy(accounts: AccountRow[]): LegacySection {
  const rows: LegacyRow[] = accounts
    .filter((a) => a.redeemed > 0)
    .map((a) => ({
      phone: a.phone,
      name: a.name,
      stamps: a.stamps,
      redeemed: a.redeemed,
      legacyEarned: Math.floor(a.stamps / LEGACY_THRESHOLD),
    }))
    .sort((x, y) => y.redeemed - x.redeemed || x.phone.localeCompare(y.phone));
  return {
    totalRedeemed: accounts.reduce((s, a) => s + a.redeemed, 0),
    accountsWithRedeemed: rows.length,
    rows,
    legacyEarnedTotal: accounts.reduce((s, a) => s + Math.floor(a.stamps / LEGACY_THRESHOLD), 0),
  };
}

// ---------- 3) Posibles cuentas duplicadas por teléfono ----------

export interface DupMember {
  phone: string;
  name: string | null;
  stamps: number;
  orderCount: number;
  normalized: string;
}

export interface DupGroup {
  // Clave que agrupa a las cuentas (número normalizado o últimos 8 dígitos).
  key: string;
  members: DupMember[];
  stampsSum: number;
}

export interface PhoneFormatIssues {
  withSymbols: DupMember[]; // espacios, +, guiones, paréntesis…
  tooShort: DupMember[]; // menos de 8 dígitos
  otherFormat: DupMember[]; // no queda como móvil argentino de 13 dígitos (549…)
}

export interface DuplicatesSection {
  // Mismo número una vez normalizado, cargado con distinto formato: casi seguro la misma persona.
  sameNumber: DupGroup[];
  // Mismos últimos 8 dígitos pero no coinciden al normalizar: hay que revisarlos a mano.
  ambiguous: DupGroup[];
  formats: PhoneFormatIssues;
}

function member(a: AccountRow): DupMember {
  return {
    phone: a.phone,
    name: a.name,
    stamps: a.stamps,
    orderCount: a.orderCount,
    normalized: whatsappDigits(a.phone),
  };
}

function toGroups(map: Map<string, DupMember[]>, minDistinctKeys: number): DupGroup[] {
  const groups: DupGroup[] = [];
  for (const [key, members] of map) {
    if (members.length < 2) continue;
    if (new Set(members.map((m) => m.normalized)).size < minDistinctKeys) continue;
    groups.push({
      key,
      members: members.sort((a, b) => a.phone.localeCompare(b.phone)),
      stampsSum: members.reduce((s, m) => s + m.stamps, 0),
    });
  }
  return groups.sort((a, b) => b.stampsSum - a.stampsSum || a.key.localeCompare(b.key));
}

export function detectDuplicates(accounts: AccountRow[]): DuplicatesSection {
  const byNormalized = new Map<string, DupMember[]>();
  const byLast8 = new Map<string, DupMember[]>();
  const formats: PhoneFormatIssues = { withSymbols: [], tooShort: [], otherFormat: [] };

  for (const a of accounts) {
    const m = member(a);
    const digits = a.phone.replace(/\D/g, "");
    if (/\D/.test(a.phone)) formats.withSymbols.push(m);
    if (digits.length < 8) {
      formats.tooShort.push(m);
      continue; // un número tan corto no sirve para agrupar
    }
    if (!/^549\d{10}$/.test(m.normalized)) formats.otherFormat.push(m);
    if (!byNormalized.has(m.normalized)) byNormalized.set(m.normalized, []);
    byNormalized.get(m.normalized)!.push(m);
    const last8 = digits.slice(-8);
    if (!byLast8.has(last8)) byLast8.set(last8, []);
    byLast8.get(last8)!.push(m);
  }

  return {
    sameNumber: toGroups(byNormalized, 1),
    ambiguous: toGroups(byLast8, 2),
    formats,
  };
}

// ---------- 4) Consistencia: sellos de la cuenta vs transacciones registradas ----------

export interface ConsistencyRow {
  phone: string;
  name: string | null;
  stamps: number;
  txStamps: number;
  txCount: number;
  orderCount: number;
  // sellos de la cuenta menos sellos del historial (positivo = la cuenta tiene más).
  diff: number;
  kind: "sin_historial" | "difiere";
}

export interface OrphanTx {
  phone: string;
  txCount: number;
  txStamps: number;
}

export interface ConsistencySection {
  accountsChecked: number;
  consistent: number;
  // Cuentas con sellos y ninguna transacción (suele ser anterior al historial).
  withoutHistory: ConsistencyRow[];
  // Cuentas con historial pero cuyos sellos no coinciden con la suma.
  mismatched: ConsistencyRow[];
  // Transacciones de teléfonos que no tienen cuenta.
  orphanTransactions: OrphanTx[];
}

export function checkConsistency(accounts: AccountRow[], txs: TxAggregate[]): ConsistencySection {
  const byPhone = new Map(txs.map((t) => [t.phone, t]));
  const withoutHistory: ConsistencyRow[] = [];
  const mismatched: ConsistencyRow[] = [];
  let consistent = 0;

  for (const a of accounts) {
    const t = byPhone.get(a.phone);
    const txStamps = t?.stampsSum ?? 0;
    const txCount = t?.count ?? 0;
    const diff = a.stamps - txStamps;
    const row = (kind: ConsistencyRow["kind"]): ConsistencyRow => ({
      phone: a.phone,
      name: a.name,
      stamps: a.stamps,
      txStamps,
      txCount,
      orderCount: a.orderCount,
      diff,
      kind,
    });
    if (txCount === 0) {
      if (a.stamps !== 0) withoutHistory.push(row("sin_historial"));
      else consistent += 1;
    } else if (diff !== 0) {
      mismatched.push(row("difiere"));
    } else {
      consistent += 1;
    }
  }

  const accountPhones = new Set(accounts.map((a) => a.phone));
  const orphanTransactions = txs
    .filter((t) => !accountPhones.has(t.phone))
    .map((t) => ({ phone: t.phone, txCount: t.count, txStamps: t.stampsSum }));

  withoutHistory.sort((x, y) => y.stamps - x.stamps || x.phone.localeCompare(y.phone));
  mismatched.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff) || x.phone.localeCompare(y.phone));
  return { accountsChecked: accounts.length, consistent, withoutHistory, mismatched, orphanTransactions };
}

// ---------- 5) De dónde salen los datos (para confirmar que es producción) ----------

export type SourceLevel = "produccion" | "preview" | "postgres_externo" | "local" | "ninguna";

export interface DataSource {
  engine: "postgres" | "sqlite" | "none";
  level: SourceLevel;
  label: string;
  warning: string | null;
  vercelEnv: string | null;
  // Solo host y nombre de la base de PostgreSQL. Nunca usuario, contraseña ni parámetros.
  host: string | null;
  database: string | null;
  // Solo el nombre del archivo SQLite (sin carpetas).
  file: string | null;
}

export function describeSource(input: {
  mode: "postgres" | "sqlite" | "none";
  databaseUrl?: string | null;
  vercelEnv?: string | null;
  sqlitePath?: string | null;
}): DataSource {
  const vercelEnv = input.vercelEnv || null;
  if (input.mode === "postgres") {
    let host: string | null = null;
    let database: string | null = null;
    try {
      const url = new URL(input.databaseUrl ?? "");
      host = url.hostname || null;
      database = url.pathname.replace(/^\//, "") || null;
    } catch {
      // URL ilegible: no se muestra nada de ella.
    }
    const base = { engine: "postgres" as const, vercelEnv, host, database, file: null };
    if (vercelEnv === "production") {
      return { ...base, level: "produccion", label: "PostgreSQL · Producción (Vercel)", warning: null };
    }
    if (vercelEnv) {
      return {
        ...base,
        level: "preview",
        label: `PostgreSQL · Vercel (${vercelEnv})`,
        warning: "No es el entorno de producción de Vercel. Verificá que el servidor sea el de la base real.",
      };
    }
    return {
      ...base,
      level: "postgres_externo",
      label: "PostgreSQL · fuera de Vercel",
      warning: "Este servidor no corre en Vercel: puede ser una copia local o de prueba. Comprobá el servidor de abajo.",
    };
  }
  if (input.mode === "sqlite") {
    const file = (input.sqlitePath ?? "").split(/[\\/]/).filter(Boolean).pop() || "maderosys.db";
    return {
      engine: "sqlite",
      level: "local",
      label: "SQLite · base LOCAL de esta computadora",
      warning: "NO son los datos de producción: es la base local de esta PC, no la de la web.",
      vercelEnv,
      host: null,
      database: null,
      file,
    };
  }
  return {
    engine: "none",
    level: "ninguna",
    label: "Sin base de datos",
    warning: "No hay base de datos configurada.",
    vercelEnv,
    host: null,
    database: null,
    file: null,
  };
}

// ---------- Informe completo ----------

export interface LoyaltyReport {
  generatedAt: string;
  source: DataSource;
  // Huellas para cotejar con otras pantallas (Clientes) y con la actividad real.
  fingerprint: {
    accounts: number;
    totalStamps: number;
    transactions: number;
    lastAccountUpdate: string | null;
    lastTransaction: string | null;
    transactionTypes: { type: string; count: number }[];
  };
  retroactive: RetroSection;
  legacy: LegacySection;
  duplicates: DuplicatesSection;
  consistency: ConsistencySection;
}

export interface RawLoyaltyData {
  accounts: AccountRow[];
  txs: TxAggregate[];
  transactionTypes: { type: string; count: number }[];
  lastTransaction: string | null;
}

export function buildLoyaltyReport(raw: RawLoyaltyData, source: DataSource, now = new Date()): LoyaltyReport {
  const updated = raw.accounts.map((a) => a.updatedAt).filter((d): d is string => !!d);
  return {
    generatedAt: now.toISOString(),
    source,
    fingerprint: {
      accounts: raw.accounts.length,
      totalStamps: raw.accounts.reduce((s, a) => s + a.stamps, 0),
      transactions: raw.transactionTypes.reduce((s, t) => s + t.count, 0),
      lastAccountUpdate: updated.length ? updated.sort().at(-1)! : null,
      lastTransaction: raw.lastTransaction,
      transactionTypes: raw.transactionTypes,
    },
    retroactive: computeRetroactive(raw.accounts),
    legacy: computeLegacy(raw.accounts),
    duplicates: detectDuplicates(raw.accounts),
    consistency: checkConsistency(raw.accounts, raw.txs),
  };
}
