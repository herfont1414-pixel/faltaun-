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

export function DashboardView({ tables, onGoTo }: DashboardViewProps) {
  const [salesToday, setSalesToday] = useState<{ total: number; count: number } | null>(null);
  const [pendingWeb, setPendingWeb] = useState<number | null>(null);
  const [pendingReservations, setPendingReservations] = useState<number | null>(null);

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
