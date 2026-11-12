"use client";

import { useEffect, useState } from "react";
import { FidelidadPremiosView } from "@/components/admin/fidelidad-premios-view";
import { FidelidadInformeView } from "@/components/admin/fidelidad-informe-view";
import { FidelidadCargaView } from "@/components/admin/fidelidad-carga-view";
import { FidelidadRankingView } from "@/components/admin/fidelidad-ranking-view";

// Sección "Fidelidad": tabla de sellos de los clientes, premios y canjes (donde se registran entregas), el informe de
// solo lectura (que nunca escribe datos) y, para el administrador, la carga de sellos
// que los clientes ya tenían. Son pantallas separadas a propósito.
export function FidelidadView() {
  const [tab, setTab] = useState<"sellos" | "premios" | "informe" | "carga">("sellos");
  // Cliente elegido en la tabla de sellos: se abre su ficha en "Premios y canjes".
  const [openPhone, setOpenPhone] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { user?: { role?: string } | null }) => setIsAdmin(d.user?.role === "admin"))
      .catch(() => {});
  }, []);
  return (
    <div>
      <div className="mostrador" style={{ paddingBottom: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className={`btn ${tab === "sellos" ? "btn-primary" : ""}`} style={{ flex: "none" }} onClick={() => setTab("sellos")}>
            Sellos de clientes
          </button>
          <button type="button" className={`btn ${tab === "premios" ? "btn-primary" : ""}`} style={{ flex: "none" }} onClick={() => { setOpenPhone(null); setTab("premios"); }}>
            Premios y canjes
          </button>
          <button type="button" className={`btn ${tab === "informe" ? "btn-primary" : ""}`} style={{ flex: "none" }} onClick={() => setTab("informe")}>
            Informe (solo lectura)
          </button>
          {isAdmin && (
            <button type="button" className={`btn ${tab === "carga" ? "btn-primary" : ""}`} style={{ flex: "none" }} onClick={() => setTab("carga")}>
              Cargar sellos
            </button>
          )}
        </div>
      </div>
      {tab === "sellos" ? (
        <FidelidadRankingView
          onOpenCustomer={(phone) => {
            setOpenPhone(phone);
            setTab("premios");
          }}
        />
      ) : tab === "premios" ? (
        <FidelidadPremiosView key={openPhone ?? "-"} initialPhone={openPhone} />
      ) : tab === "informe" ? (
        <FidelidadInformeView />
      ) : (
        <FidelidadCargaView />
      )}
    </div>
  );
}
