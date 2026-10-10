"use client";

import { useState } from "react";
import { FidelidadPremiosView } from "@/components/admin/fidelidad-premios-view";
import { FidelidadInformeView } from "@/components/admin/fidelidad-informe-view";

// Sección "Fidelidad": premios y canjes (donde se registran entregas) y el informe de
// solo lectura (que nunca escribe datos). Son pantallas separadas a propósito.
export function FidelidadView() {
  const [tab, setTab] = useState<"premios" | "informe">("premios");
  return (
    <div>
      <div className="mostrador" style={{ paddingBottom: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={`btn ${tab === "premios" ? "btn-primary" : ""}`} style={{ flex: "none" }} onClick={() => setTab("premios")}>
            Premios y canjes
          </button>
          <button type="button" className={`btn ${tab === "informe" ? "btn-primary" : ""}`} style={{ flex: "none" }} onClick={() => setTab("informe")}>
            Informe (solo lectura)
          </button>
        </div>
      </div>
      {tab === "premios" ? <FidelidadPremiosView /> : <FidelidadInformeView />}
    </div>
  );
}
