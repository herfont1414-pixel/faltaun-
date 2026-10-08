"use client";

import { useEffect, useState } from "react";
import type { Section } from "@/lib/admin/client-types";

const SECTION_LABEL: Record<Section, string> = {
  inicio: "Inicio",
  mesas: "Mesas",
  mostrador: "Mostrador",
  "pedidos-web": "Pedidos web",
  productos: "Productos",
  caja: "Caja",
  reportes: "Reportes",
  gastos: "Gastos",
  delivery: "Delivery",
  express: "Mostrador express",
  reservas: "Reservas",
  clientes: "Clientes",
  impresion: "Impresión",
};

function fmtDateTime(d: Date) {
  const date = d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function AdminHeader({ section }: { section: Section }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-6">
      <div className="text-sm text-gray-500">
        <span className="text-gray-400">Panel</span>
        <span className="mx-1.5 text-gray-300">/</span>
        <span className="font-semibold text-gray-900">{SECTION_LABEL[section] ?? section}</span>
      </div>

      <div className="flex items-center gap-4">
        {now && <span className="text-xs capitalize text-gray-400">{fmtDateTime(now)}</span>}
        <div className="flex items-center gap-2.5 border-l border-gray-100 pl-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold text-white">
            MR
          </div>
          <div className="leading-tight">
            <div className="text-[12px] font-semibold text-gray-800">Madero Restó</div>
            <div className="text-[10.5px] text-gray-400">gestión interna</div>
          </div>
        </div>
      </div>
    </header>
  );
}
