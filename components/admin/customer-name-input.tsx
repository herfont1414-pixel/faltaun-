"use client";

import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/admin/format";
import { matchCustomers } from "@/lib/admin/customer-match";
import type { DirectoryCustomer } from "@/lib/admin/crm";

// La lista se trae una vez y se reusa un rato entre formularios (se filtra en la pantalla,
// así las sugerencias salen al instante aunque la base esté en la nube).
let cache: { at: number; list: DirectoryCustomer[] } | null = null;
let inflight: Promise<DirectoryCustomer[]> | null = null;
const CACHE_MS = 60_000;

function loadDirectory(): Promise<DirectoryCustomer[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.list);
  if (!inflight) {
    inflight = fetch("/api/admin/customer-directory", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { customers: [] }))
      .then((data: { customers?: DirectoryCustomer[] }) => {
        cache = { at: Date.now(), list: data.customers ?? [] };
        return cache.list;
      })
      .catch(() => cache?.list ?? [])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
};

export function customerSummary(c: DirectoryCustomer) {
  const parts: string[] = [];
  if (c.phone) parts.push(c.phone);
  parts.push(c.orders > 0 ? `${c.orders} compra${c.orders === 1 ? "" : "s"} · ${money(c.spent)}` : "sin compras registradas");
  if (c.lastOrderAt) parts.push(`última ${shortDate(c.lastOrderAt)}`);
  if (c.stamps > 0) parts.push(`${c.stamps} sello${c.stamps === 1 ? "" : "s"}`);
  if (c.ccBalance !== null) parts.push(`Cta. Cte. ${money(c.ccBalance)}`);
  return parts.join(" · ");
}

// Campo de nombre de cliente que, mientras se escribe, muestra los clientes que ya están en
// el sistema con sus compras; al elegir uno se cargan sus datos (nombre, teléfono, dirección).
export function CustomerNameInput({
  value,
  onChange,
  onPick,
  placeholder,
  className,
  style,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (customer: DirectoryCustomer) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}) {
  const [list, setList] = useState<DirectoryCustomer[]>(cache?.list ?? []);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let alive = true;
    loadDirectory().then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, []);

  const matches = useMemo(() => (open ? matchCustomers(list, value) : []), [list, value, open]);

  function pick(c: DirectoryCustomer) {
    onPick(c);
    setOpen(false);
  }

  return (
    <div className="cust-search">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className={className}
        style={style}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={matches.length > 0}
      />
      {matches.length > 0 && (
        <div className="cust-suggest" role="listbox">
          {matches.map((c, i) => (
            <button
              key={`${c.name}|${c.phone ?? ""}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`cust-option ${i === active ? "active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c)}
            >
              <span className="cust-name">{c.name}</span>
              <span className="cust-meta">{customerSummary(c)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
