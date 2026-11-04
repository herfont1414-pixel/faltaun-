"use client";

import { useEffect, useState } from "react";
import { FidelidadPremiosView } from "@/components/admin/fidelidad-premios-view";
import { FidelidadInformeView } from "@/components/admin/fidelidad-informe-view";
import { FidelidadCargaView } from "@/components/admin/fidelidad-carga-view";

// Sección "Fidelidad": premios y canjes (donde se registran entregas), el informe de
// solo lectura (que nunca escribe datos) y, para el administrador, la carga de sellos
// que los clientes ya tenían. Son pantallas separadas a propósito.
export function FidelidadView() {
  const [tab, setTab] = useState<"premios" | "informe" | "carga">("premios");
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
          <button type="button" className={`btn ${tab === "premios" ? "btn-primary" : ""}`} style={{ flex: "none" }} onClick={() => setTab("premios")}>
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
      {tab === "premios" ? <FidelidadPremiosView /> : tab === "informe" ? <FidelidadInformeView /> : <FidelidadCargaView />}
    </div>
  );
}
