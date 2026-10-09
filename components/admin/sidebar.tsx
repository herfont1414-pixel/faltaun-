"use client";

import {
  Home,
  LayoutGrid,
  Store,
  Truck,
  Zap,
  Globe,
  CalendarCheck,
  Package,
  Users,
  Wallet,
  BarChart3,
  Receipt,
  Monitor,
  Settings,
  Printer,
  UserCog,
  History,
  Carrot,
  ShoppingCart,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/admin/brand-logo";
import type { Section } from "@/lib/admin/client-types";

interface NavItem {
  label: string;
  Icon: typeof Home;
  section?: Section;
  action?: "kds";
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operación",
    items: [
      { label: "Inicio", Icon: Home, section: "inicio" },
      { label: "Mesas", Icon: LayoutGrid, section: "mesas" },
      { label: "Mostrador", Icon: Store, section: "mostrador" },
      { label: "Delivery", Icon: Truck, section: "delivery" },
      { label: "Mostrador express", Icon: Zap, section: "express" },
      { label: "Pedidos web", Icon: Globe, section: "pedidos-web" },
      { label: "Reservas", Icon: CalendarCheck, section: "reservas" },
    ],
  },
  {
    title: "Gestión",
    items: [
      { label: "Productos", Icon: Package, section: "productos" },
      { label: "Ingredientes", Icon: Carrot, section: "ingredientes" },
      { label: "Compras", Icon: ShoppingCart, section: "compras" },
      { label: "Clientes", Icon: Users, section: "clientes" },
      { label: "Caja", Icon: Wallet, section: "caja" },
      { label: "Reportes", Icon: BarChart3, section: "reportes" },
      { label: "Gastos", Icon: Receipt, section: "gastos" },
    ],
  },
  {
    title: "Más",
    items: [
      { label: "Cocina (KDS)", Icon: Monitor, action: "kds" },
      { label: "Impresión", Icon: Printer, section: "impresion" },
      { label: "Usuarios", Icon: UserCog, section: "usuarios" },
      { label: "Auditoría", Icon: History, section: "auditoria" },
      { label: "Configuración", Icon: Settings, section: "configuracion" },
    ],
  },
];

interface SidebarProps {
  activeSection: Section;
  onNavigate: (section: Section) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ activeSection, onNavigate, mobileOpen, onCloseMobile }: SidebarProps) {
  function handleClick(item: NavItem) {
    onCloseMobile();
    if (item.section) {
      onNavigate(item.section);
      return;
    }
    if (item.action === "kds") {
      window.open("/admin/kds", "_blank");
    }
  }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col overflow-y-auto bg-slate-950 py-5 transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-56 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-5">
          <BrandLogo />
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
            className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-5 px-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {group.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = item.section && item.section === activeSection;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleClick(item)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition ${
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                      }`}
                    >
                      <item.Icon size={16} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
