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
} from "lucide-react";
import { BrandLogo } from "@/components/admin/brand-logo";
import type { Section } from "@/lib/admin/client-types";

interface NavItem {
  label: string;
  Icon: typeof Home;
  section?: Section;
  action?: "kds" | "toast";
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
      { label: "Configuración", Icon: Settings, action: "toast" },
    ],
  },
];

interface SidebarProps {
  activeSection: Section;
  onNavigate: (section: Section) => void;
  onToast: (message: string) => void;
}

export function Sidebar({ activeSection, onNavigate, onToast }: SidebarProps) {
  function handleClick(item: NavItem) {
    if (item.section) {
      onNavigate(item.section);
      return;
    }
    if (item.action === "kds") {
      window.open("/admin/kds", "_blank");
      return;
    }
    onToast(`${item.label}: lo sumamos en el próximo paso`);
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col overflow-y-auto bg-slate-950 py-5">
      <div className="px-5 pb-5">
        <BrandLogo />
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
  );
}
