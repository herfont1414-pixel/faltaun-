"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Globe, Monitor, Truck, CalendarCheck, ArrowRight } from "lucide-react";
import { money } from "@/lib/admin/format";
import type { TableRow } from "@/lib/admin/types";

interface DashboardViewProps {
  tables: TableRow[];
  onGoTo: (section: "mesas" | "pedidos-web" | "delivery" | "reservas") => void;
}

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

const QUICK_ACTIONS = [
  { key: "mesas", label: "Abrir mesa", Icon: LayoutGrid },
  { key: "pedidos-web", label: "Pedidos web", Icon: Globe },
  { key: "delivery", label: "Nuevo delivery", Icon: Truck },
  { key: "reservas", label: "Reservas", Icon: CalendarCheck },
] as const;

interface DashboardSummary {
  ventasHoy: number;
  pedidosHoy: number;
  ticketPromedio: number;
  costoMercaderiaEstimado: number;
  margenBrutoEstimado: number | null;
  gastosHoy: number;
  resultadoOperativoEstimado: number | null;
  cajaEsperada: number | null;
  turnoAbierto: boolean;
  pedidosDeliveryHoy: number;
  clientesNuevosHoy: number;
  topVendidos: { name: string; qty: number; revenue: number }[];
  masRentables: { name: string; qty: number; marginTotal: number; marginPct: number }[];
  pocoVolumenPocoMargen: { name: string; qty: number; marginPct: number }[];
  alertas: { type: string; message: string }[];
}

const ALERT_ICON: Record<string, string> = {
  stock_critico: "📦",
  costo_ingrediente_subio: "📈",
  margen_bajo: "⚠️",
  caja_con_diferencia: "💸",
  pedido_pendiente: "⏰",
};

export function DashboardView({ tables, onGoTo }: DashboardViewProps) {
  const [salesToday, setSalesToday] = useState<{ total: number; count: number } | null>(null);
  const [pendingWeb, setPendingWeb] = useState<number | null>(null);
  const [pendingReservations, setPendingReservations] = useState<number | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    const now = new Date();
    const from = startOfDay(now).toISOString();
    const to = endOfDay(now).toISOString();

    fetch(`/api/admin/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((res) => res.json())
      .then((data: { report?: { totalSales: number; orderCount: number } }) => {
        if (data.report) setSalesToday({ total: data.report.totalSales, count: data.report.orderCount });
      });

    fetch("/api/admin/web-orders?status=pendiente")
      .then((res) => res.json())
      .then((data: { orders: unknown[] }) => setPendingWeb(data.orders?.length ?? 0));

    fetch("/api/admin/reservations?status=pendiente")
      .then((res) => res.json())
      .then((data: { reservations: unknown[] }) => setPendingReservations(data.reservations?.length ?? 0));

    fetch("/api/admin/dashboard")
      .then((res) => (res.ok ? res.json() : { summary: null }))
      .then((data: { summary: DashboardSummary | null }) => setSummary(data.summary));
  }, []);

  const occupied = tables.filter((t) => t.status !== "libre").length;
  const free = tables.length - occupied;
  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Hoy es {today}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">Hola, Madero Restó</h1>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="col-span-2 rounded-3xl bg-gray-900 p-5 text-white shadow-sm sm:col-span-1">
            <span className="text-xs font-medium text-gray-400">Ventas de hoy</span>
            <div className="mt-2 text-3xl font-bold tabular-nums">
              {salesToday ? money(salesToday.total) : "···"}
            </div>
            <span className="mt-1 block text-xs text-gray-400">
              {salesToday
                ? `${salesToday.count} pedido${salesToday.count === 1 ? "" : "s"} cerrado${
                    salesToday.count === 1 ? "" : "s"
                  }`
                : "cargando"}
            </span>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <span className="text-xs font-medium text-gray-400">Mesas</span>
            <div className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
              {occupied}
              <span className="text-gray-300">/{tables.length}</span>
            </div>
            <span className="mt-1 block text-xs text-gray-400">ocupadas · {free} libres</span>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <span className="text-xs font-medium text-gray-400">Pedidos web</span>
            <div className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{pendingWeb ?? "···"}</div>
            <span className="mt-1 block text-xs text-gray-400">pendientes de confirmar</span>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <span className="text-xs font-medium text-gray-400">Reservas</span>
            <div className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
              {pendingReservations ?? "···"}
            </div>
            <span className="mt-1 block text-xs text-gray-400">pendientes de responder</span>
          </div>
        </div>

        {summary && summary.alertas.length > 0 && (
          <div className="mt-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Alertas</div>
            <div className="flex flex-col gap-1.5">
              {summary.alertas.slice(0, 8).map((a, i) => (
                <div key={i} className="text-sm text-amber-900">
                  {ALERT_ICON[a.type] ?? "•"} {a.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {summary && (
          <>
            <div className="mt-8 text-sm font-semibold text-gray-500">Rentabilidad de hoy</div>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <span className="text-xs font-medium text-gray-400">Ticket promedio</span>
                <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                  {money(summary.ticketPromedio)}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <span className="text-xs font-medium text-gray-400">Margen bruto estimado</span>
                <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                  {summary.margenBrutoEstimado !== null ? money(summary.margenBrutoEstimado) : "—"}
                </div>
                {summary.margenBrutoEstimado === null && (
                  <span className="text-[11px] text-gray-400">sin recetas cargadas</span>
                )}
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <span className="text-xs font-medium text-gray-400">Gastos de hoy</span>
                <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                  {money(summary.gastosHoy)}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <span className="text-xs font-medium text-gray-400">Resultado operativo est.</span>
                <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                  {summary.resultadoOperativoEstimado !== null ? money(summary.resultadoOperativoEstimado) : "—"}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <span className="text-xs font-medium text-gray-400">Caja esperada</span>
                <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                  {summary.turnoAbierto && summary.cajaEsperada !== null ? money(summary.cajaEsperada) : "—"}
                </div>
                {!summary.turnoAbierto && <span className="text-[11px] text-gray-400">sin turno abierto</span>}
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <span className="text-xs font-medium text-gray-400">Delivery hoy</span>
                <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                  {summary.pedidosDeliveryHoy}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <span className="text-xs font-medium text-gray-400">Clientes nuevos hoy</span>
                <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                  {summary.clientesNuevosHoy}
                </div>
              </div>
            </div>

            {(summary.topVendidos.length > 0 || summary.masRentables.length > 0) && (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Más vendidos hoy
                  </div>
                  {summary.topVendidos.map((p) => (
                    <div key={p.name} className="flex justify-between py-1 text-sm text-gray-700">
                      <span>{p.name}</span>
                      <span className="font-semibold">x{p.qty}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Más rentables hoy (con receta)
                  </div>
                  {summary.masRentables.length === 0 ? (
                    <div className="text-sm text-gray-400">Sin recetas cargadas todavía.</div>
                  ) : (
                    summary.masRentables.map((p) => (
                      <div key={p.name} className="flex justify-between py-1 text-sm text-gray-700">
                        <span>{p.name}</span>
                        <span className="font-semibold">
                          {money(p.marginTotal)} ({p.marginPct.toFixed(0)}%)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-8 text-sm font-semibold text-gray-500">Accesos rápidos</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onGoTo(key)}
              className="group flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-100 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
                <Icon size={18} />
              </span>
              <span className="flex-1 text-sm font-semibold text-gray-800">{label}</span>
              <ArrowRight size={16} className="text-gray-300 transition group-hover:text-gray-500" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => window.open("/admin/kds", "_blank")}
            className="group flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-100 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
              <Monitor size={18} />
            </span>
            <span className="flex-1 text-sm font-semibold text-gray-800">Ver cocina (KDS)</span>
            <ArrowRight size={16} className="text-gray-300 transition group-hover:text-gray-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
