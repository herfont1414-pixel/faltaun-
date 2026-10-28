"use client";

import { whatsappDigits } from "@/lib/phone";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { playBeep } from "@/lib/admin/beep";
import type { Reservation, TableRow } from "@/lib/admin/types";

function waLink(phone: string, message: string) {
  const digits = whatsappDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function fmtDate(dateStr: string, timeStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const dateLabel = date.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
  return `${dateLabel} · ${timeStr}`;
}

// Fecha de hoy en el local (Argentina, UTC-3).
function todayKey() {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}
function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayHeading(day: string) {
  const today = todayKey();
  if (day === today) return "Hoy";
  if (day === addDays(today, 1)) return "Mañana";
  const d = new Date(`${day}T12:00:00.000Z`);
  const text = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function confirmMessage(r: { customerName: string; partySize: number; date: string; time: string; tableNumber: number | null }) {
  const mesa = r.tableNumber ? ` (mesa ${r.tableNumber})` : "";
  return `Hola ${r.customerName}! Confirmamos tu reserva en Madero Restó para ${r.partySize} persona(s) el ${r.date} a las ${r.time}${mesa}. ¡Te esperamos!`;
}

async function patchReservation(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/reservations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar la reserva");
}

function TableSelect({
  tables,
  value,
  onChange,
  disabled,
}: {
  tables: TableRow[];
  value: number | null;
  onChange: (table: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="caja-input"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      style={{ padding: "6px 8px", maxWidth: 170 }}
    >
      <option value="">Sin mesa</option>
      {tables.map((t) => (
        <option key={t.number} value={t.number}>
          Mesa {t.number} · {t.zone === "salon" ? "Salón" : "Terraza"}
        </option>
      ))}
    </select>
  );
}

function NewReservationModal({ tables, onClose, onCreated }: { tables: TableRow[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ customerName: "", customerPhone: "", partySize: "2", date: todayKey(), time: "21:00", notes: "" });
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    // La pestaña de WhatsApp se abre dentro del clic (si no, el navegador la bloquea).
    const wa = notify && form.customerPhone.trim() ? window.open("", "_blank") : null;
    const res = await fetch("/api/admin/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, partySize: Number(form.partySize), tableNumber }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      wa?.close();
      setError(data.error ?? "No se pudo crear la reserva");
      setBusy(false);
      return;
    }
    if (wa) wa.location.href = waLink(form.customerPhone, confirmMessage(data.reservation));
    onCreated();
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>Nueva reserva</div>
        <div className="res-form">
          <label className="caja-field">
            <span>Nombre</span>
            <input className="caja-input" value={form.customerName} onChange={set("customerName")} placeholder="Quién reserva" autoFocus />
          </label>
          <label className="caja-field">
            <span>Teléfono (WhatsApp)</span>
            <input className="caja-input" value={form.customerPhone} onChange={set("customerPhone")} placeholder="Opcional" inputMode="tel" />
          </label>
          <div className="res-row">
            <label className="caja-field">
              <span>Personas</span>
              <input className="caja-input" type="number" min={1} max={60} value={form.partySize} onChange={set("partySize")} />
            </label>
            <label className="caja-field">
              <span>Fecha</span>
              <input className="caja-input" type="date" min={todayKey()} value={form.date} onChange={set("date")} />
            </label>
            <label className="caja-field">
              <span>Hora</span>
              <input className="caja-input" type="time" value={form.time} onChange={set("time")} />
            </label>
          </div>
          <label className="caja-field">
            <span>Mesa</span>
            <TableSelect tables={tables} value={tableNumber} onChange={setTableNumber} />
          </label>
          <label className="caja-field">
            <span>Notas</span>
            <textarea className="caja-input" rows={2} value={form.notes} onChange={set("notes")} placeholder="Cumpleaños, silla para bebé…" />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Mandarle la confirmación por WhatsApp
          </label>
        </div>
        {error && <div className="res-error">{error}</div>}
        <div className="footer-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Guardando…" : "Guardar reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReservationsView({ tables = [] }: { tables?: TableRow[] }) {
  const [pending, setPending] = useState<Reservation[]>([]);
  const [upcoming, setUpcoming] = useState<Reservation[]>([]);
  const [recent, setRecent] = useState<Reservation[]>([]);
  const [newReservation, setNewReservation] = useState<Reservation | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingTable, setPendingTable] = useState<Record<string, number | null>>({});
  const [message, setMessage] = useState("");
  const seenIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  const sortedTables = [...tables].sort((a, b) => a.number - b.number);

  const poll = useCallback(async () => {
    const [pendingRes, recentRes, upcomingRes] = await Promise.all([
      fetch("/api/admin/reservations?status=pendiente").then((r) => r.json()),
      fetch("/api/admin/reservations").then((r) => r.json()),
      fetch("/api/admin/reservations?scope=upcoming").then((r) => r.json()),
    ]);
    const pendingReservations: Reservation[] = pendingRes.reservations ?? [];
    if (!firstLoad.current) {
      const unseen = pendingReservations.find((r) => !seenIds.current.has(r.id));
      if (unseen) {
        playBeep();
        setNewReservation(unseen);
      }
    }
    firstLoad.current = false;
    pendingReservations.forEach((r) => seenIds.current.add(r.id));

    setPending(pendingReservations);
    setUpcoming(upcomingRes.reservations ?? []);
    setRecent((recentRes.reservations ?? []).filter((r: Reservation) => r.status !== "pendiente"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled && document.visibilityState === "visible") poll().catch(() => {});
    };
    tick();
    const interval = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [poll]);

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(""), 4000);
  }

  async function respond(reservation: Reservation, status: "confirmada" | "rechazada") {
    const table = pendingTable[reservation.id] ?? null;
    const wa = window.open("", "_blank");
    try {
      await patchReservation(reservation.id, status === "confirmada" ? { status, tableNumber: table } : { status });
    } catch (e) {
      wa?.close();
      flash((e as Error).message);
      return;
    }
    setPending((prev) => prev.filter((r) => r.id !== reservation.id));
    if (newReservation?.id === reservation.id) setNewReservation(null);

    const text =
      status === "confirmada"
        ? confirmMessage({ ...reservation, tableNumber: table })
        : `Hola ${reservation.customerName}, lamentablemente no podemos confirmar tu reserva del ${reservation.date} a las ${reservation.time}. ¡Disculpá las molestias!`;
    if (wa) wa.location.href = waLink(reservation.customerPhone, text);
    poll().catch(() => {});
  }

  async function changeTable(r: Reservation, table: number | null) {
    try {
      await patchReservation(r.id, { tableNumber: table });
      setUpcoming((prev) => prev.map((x) => (x.id === r.id ? { ...x, tableNumber: table } : x)));
      flash(table ? `Reserva de ${r.customerName}: mesa ${table}` : `Reserva de ${r.customerName}: sin mesa`);
    } catch (e) {
      flash((e as Error).message);
    }
  }

  async function cancel(r: Reservation) {
    if (!window.confirm(`¿Cancelar la reserva de ${r.customerName} (${fmtDate(r.date, r.time)})?`)) return;
    try {
      await patchReservation(r.id, { status: "rechazada" });
      setUpcoming((prev) => prev.filter((x) => x.id !== r.id));
      flash("Reserva cancelada");
    } catch (e) {
      flash((e as Error).message);
    }
  }

  // Próximas reservas agrupadas por día.
  const byDay = new Map<string, Reservation[]>();
  for (const r of upcoming) {
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date)!.push(r);
  }

  return (
    <div className="mostrador">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Reservas</h1>
        <button type="button" className="btn btn-primary" style={{ flex: "none", display: "inline-flex", gap: 6, alignItems: "center" }} onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva reserva
        </button>
      </div>

      {message && <div className="res-flash">{message}</div>}

      {newReservation && (
        <div
          style={{
            position: "fixed",
            top: 70,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 70,
            background: "#2c2c2a",
            color: "#fff",
            padding: "14px 20px",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          🔔 Nueva reserva de <strong>{newReservation.customerName}</strong> · {fmtDate(newReservation.date, newReservation.time)}
        </div>
      )}

      <div className="m-section">
        <div className="m-section-title">Pendientes de la web ({pending.length})</div>
        {pending.length === 0 ? (
          <div className="m-table">
            <div className="m-empty">Sin reservas pendientes.</div>
          </div>
        ) : (
          pending.map((r) => (
            <div key={r.id} className="res-card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <strong>{r.customerName}</strong>
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{r.customerPhone}</div>
                </div>
                <div style={{ fontWeight: 700 }}>{fmtDate(r.date, r.time)}</div>
              </div>
              <div style={{ margin: "10px 0", fontSize: 13 }}>{r.partySize} persona(s)</div>
              {r.notes && <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>Nota: {r.notes}</div>}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <TableSelect
                  tables={sortedTables}
                  value={pendingTable[r.id] ?? null}
                  onChange={(t) => setPendingTable((prev) => ({ ...prev, [r.id]: t }))}
                />
                <button type="button" className="btn btn-primary" style={{ flex: "none" }} onClick={() => respond(r, "confirmada")}>
                  Confirmar
                </button>
                <button type="button" className="btn btn-danger" style={{ flex: "none" }} onClick={() => respond(r, "rechazada")}>
                  Rechazar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="m-section">
        <div className="m-section-title">Próximas reservas confirmadas ({upcoming.length})</div>
        {upcoming.length === 0 ? (
          <div className="m-table">
            <div className="m-empty">No hay reservas confirmadas para hoy ni los próximos días.</div>
          </div>
        ) : (
          [...byDay.entries()].map(([day, list]) => (
            <div key={day} style={{ marginBottom: 14 }}>
              <div className="res-day">
                {dayHeading(day)} · {list.length} reserva{list.length === 1 ? "" : "s"} · {list.reduce((s, r) => s + r.partySize, 0)} personas
              </div>
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Nombre</th>
                    <th style={{ textAlign: "right" }}>Pers.</th>
                    <th>Mesa</th>
                    <th>Notas</th>
                    <th style={{ textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700 }}>{r.time}</td>
                      <td>
                        {r.customerName}
                        <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                          {r.source === "panel" ? "Cargada en el panel" : "Desde la web"}
                          {r.customerPhone ? ` · ${r.customerPhone}` : ""}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>{r.partySize}</td>
                      <td>
                        <TableSelect tables={sortedTables} value={r.tableNumber} onChange={(t) => changeTable(r, t)} />
                      </td>
                      <td style={{ color: "var(--text-dim)", fontSize: 12.5 }}>{r.notes ?? ""}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {r.customerPhone && (
                          <a className="btn" style={{ flex: "none", padding: "6px 10px", marginRight: 6 }} href={waLink(r.customerPhone, confirmMessage(r))} target="_blank" rel="noreferrer">
                            WhatsApp
                          </a>
                        )}
                        <button type="button" className="btn btn-danger" style={{ flex: "none", padding: "6px 10px" }} onClick={() => cancel(r)}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      <div className="m-section">
        <div className="m-section-title">Historial reciente</div>
        <table className="m-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Mesa</th>
              <th style={{ textAlign: "right" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={4} className="m-empty">
                  Sin reservas todavía.
                </td>
              </tr>
            ) : (
              recent.map((r) => (
                <tr key={r.id}>
                  <td>{r.customerName}</td>
                  <td>{fmtDate(r.date, r.time)}</td>
                  <td>{r.tableNumber ? `Mesa ${r.tableNumber}` : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`pill ${r.status === "confirmada" ? "cerrada" : "encurso"}`}>
                      {r.status === "confirmada" ? "Confirmada" : "Rechazada / cancelada"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <NewReservationModal
          tables={sortedTables}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            flash("Reserva guardada");
            poll().catch(() => {});
          }}
        />
      )}
    </div>
  );
}
