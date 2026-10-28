"use client";

import { useEffect, useState } from "react";

export interface PublicBusinessConfig {
  name: string;
  address: string;
  hours: string;
  whatsappNumber: string;
  transferAlias: string;
  transferHolder: string;
  // false = el local no está recibiendo pedidos web (en la nube, cuando la PC no está conectada).
  ordersOpen?: boolean;
}

export function useBusinessConfig() {
  const [config, setConfig] = useState<PublicBusinessConfig | null>(null);

  useEffect(() => {
    fetch("/api/business-config")
      .then((res) => res.json())
      .then((data: { config: PublicBusinessConfig }) => setConfig(data.config ?? null))
      .catch(() => {
        // sin config cargada, los links de WhatsApp caen al número por
        // variable de entorno (ver lib/whatsapp.ts).
      });
  }, []);

  return config;
}
