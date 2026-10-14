import { getPool } from "@/lib/admin/db";
import { recordAudit } from "@/lib/admin/auth";
import { businessDayKey } from "@/lib/admin/business-day";
import type { Reservation, ReservationStatus } from "@/lib/admin/types";

function mapRow(row: any): Reservation {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    partySize: row.party_size,
    date: row.reservation_date,
    time: row.reservation_time,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    respondedAt: row.responded_at instanceof Date ? row.responded_at.toISOString() : row.responded_at,
    tableNumber: row.table_number === null || row.table_number === undefined ? null : Number(row.table_number),
    source: row.source === "panel" ? "panel" : "web",
  };
}

// Reserva hecha por el cliente desde la página (queda pendiente de confirmar).
export async function createReservation(input: {
  customerName: string;
  customerPhone: string;
  partySize: number;
  date: string;
  time: string;
  notes: string | null;
}): Promise<Reservation> {
  const pool = getPool();
  const { rows } = await pool.query(
    `insert into gestion_reservations
       (customer_name, customer_phone, party_size, reservation_date, reservation_time, notes)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [input.customerName, input.customerPhone, input.partySize, input.date, input.time, input.notes]
  );
  return mapRow(rows[0]);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// Dos reservas de la misma mesa el mismo día tienen que estar al menos a 2 horas.
const TABLE_GAP_MINUTES = 120;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// Si la mesa ya tiene otra reserva (pendiente o confirmada) cerca de ese horario, error.
async function assertTableFree(tableNumber: number, date: string, time: string, exceptId: string | null) {
  const pool = getPool();
  const { rows: tables } = await pool.query("select 1 as found from gestion_tables where number = $1", [tableNumber]);
  if (!tables[0]) throw new Error(`La mesa ${tableNumber} no existe`);
  const { rows } = await pool.query(
    `select id, customer_name, reservation_time from gestion_reservations
     where table_number = $1 and reservation_date = $2 and status in ('pendiente', 'confirmada')`,
    [tableNumber, date]
  );
  for (const r of rows) {
    if (exceptId && String(r.id) === exceptId) continue;
    if (Math.abs(toMinutes(String(r.reservation_time)) - toMinutes(time)) < TABLE_GAP_MINUTES) {
      throw new Error(`La mesa ${tableNumber} ya tiene una reserva a las ${r.reservation_time} (${r.customer_name})`);
    }
  }
}

// Reserva cargada por el personal desde el panel: queda confirmada y puede llevar mesa.
export async function createPanelReservation(
  input: {
    customerName: string;
    customerPhone?: string | null;
    partySize: number;
    date: string;
    time: string;
    tableNumber?: number | null;
    notes?: string | null;
  },
  userId: number | null,
  now: Date = new Date()
): Promise<Reservation> {
  const customerName = String(input.customerName ?? "").trim().slice(0, 80);
  const customerPhone = String(input.customerPhone ?? "").trim().slice(0, 40);
  const partySize = Number(input.partySize);
  const date = String(input.date ?? "").trim();
  const time = String(input.time ?? "").trim();
  const notes = input.notes ? String(input.notes).trim().slice(0, 200) || null : null;
  const tableNumber = input.tableNumber === null || input.tableNumber === undefined || (input.tableNumber as unknown) === "" ? null : Number(input.tableNumber);

  if (!customerName) throw new Error("Falta el nombre de quien reserva");
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 60) throw new Error("La cantidad de personas tiene que ser entre 1 y 60");
  if (!DAY.test(date)) throw new Error("Fecha inválida");
  if (!TIME.test(time)) throw new Error("Hora inválida (usá el formato 21:30)");
  if (date < businessDayKey(now)) throw new Error("La fecha de la reserva ya pasó");
  if (tableNumber !== null) {
    if (!Number.isInteger(tableNumber) || tableNumber <= 0) throw new Error("Mesa inválida");
    await assertTableFree(tableNumber, date, time, null);
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `insert into gestion_reservations
       (customer_name, customer_phone, party_size, reservation_date, reservation_time, notes,
        status, responded_at, table_number, source, created_by)
     values ($1, $2, $3, $4, $5, $6, 'confirmada', now(), $7, 'panel', $8)
     returning *`,
    [customerName, customerPhone, partySize, date, time, notes, tableNumber, userId]
  );
  const reservation = mapRow(rows[0]);
  await recordAudit({
    userId,
    action: "reservation_create",
    entity: "gestion_reservations",
    entityId: reservation.id,
    newValue: { customerName, partySize, date, time, tableNumber },
  }).catch(() => {});
  return reservation;
}

// Asignar (o quitar) la mesa de una reserva existente, con el mismo control de horario.
export async function assignReservationTable(id: string, tableNumber: number | null) {
  const pool = getPool();
  const { rows } = await pool.query("select reservation_date, reservation_time from gestion_reservations where id = $1", [id]);
  if (!rows[0]) throw new Error("Esa reserva no existe");
  if (tableNumber !== null) {
    if (!Number.isInteger(tableNumber) || tableNumber <= 0) throw new Error("Mesa inválida");
    await assertTableFree(tableNumber, String(rows[0].reservation_date), String(rows[0].reservation_time), id);
  }
  await pool.query("update gestion_reservations set table_number = $2 where id = $1", [id, tableNumber]);
}

export async function listReservations(status?: ReservationStatus): Promise<Reservation[]> {
  const pool = getPool();
  const { rows } = status
    ? await pool.query(
        "select * from gestion_reservations where status = $1 order by reservation_date, reservation_time",
        [status]
      )
    : await pool.query("select * from gestion_reservations order by created_at desc limit 30");
  return rows.map(mapRow);
}

// Próximas reservas confirmadas (desde hoy), por fecha y hora.
export async function listUpcomingReservations(now: Date = new Date()): Promise<Reservation[]> {
  const { rows } = await getPool().query(
    `select * from gestion_reservations
     where status = 'confirmada' and reservation_date >= $1
     order by reservation_date, reservation_time
     limit 200`,
    [businessDayKey(now)]
  );
  return rows.map(mapRow);
}

export async function respondReservation(id: string, status: ReservationStatus) {
  const pool = getPool();
  await pool.query("update gestion_reservations set status = $2, responded_at = now() where id = $1", [
    id,
    status,
  ]);
}
