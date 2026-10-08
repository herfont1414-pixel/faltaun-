"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
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
  configuracion: "Configuración",
  usuarios: "Usuarios",
  auditoria: "Auditoría",
  ingredientes: "Ingredientes",
  compras: "Compras",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  encargado: "Encargado",
  mozo: "Mozo",
  cocina: "Cocina",
};

function fmtDateTime(d: Date) {
  const date = d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function AdminHeader({ section, onOpenMenu }: { section: Section; onOpenMenu: () => void }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const initials = user ? user.name.slice(0, 2).toUpperCase() : "MR";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
          className="-ml-1 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
        >
          <Menu size={20} />
        </button>
        <span className="hidden text-gray-400 sm:inline">Panel</span>
        <span className="mx-1.5 hidden text-gray-300 sm:inline">/</span>
        <span className="font-semibold text-gray-900">{SECTION_LABEL[section] ?? section}</span>
      </div>

      <div className="flex items-center gap-4">
        {now && (
          <span className="hidden whitespace-nowrap text-xs capitalize text-gray-400 sm:inline">
            {fmtDateTime(now)}
          </span>
        )}
        <div className="flex items-center gap-2.5 border-l border-gray-100 pl-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold text-white">
            {initials}
          </div>
          <div className="leading-tight">
            <div className="text-[12px] font-semibold text-gray-800">{user?.name ?? "Madero Restó"}</div>
            <div className="text-[10.5px] text-gray-400">
              {user ? ROLE_LABEL[user.role] ?? user.role : "gestión interna"}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
