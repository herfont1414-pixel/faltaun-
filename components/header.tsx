"use client";

import { useState } from "react";
import Image from "next/image";
import { Receipt, Star } from "lucide-react";
import { OrderHistoryModal } from "@/components/menu/order-history-modal";
import { LoyaltyCardModal } from "@/components/menu/loyalty-card-modal";

export function Header() {
  const [showHistory, setShowHistory] = useState(false);
  const [showLoyalty, setShowLoyalty] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/5 bg-base/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Image
            src="/logo-dark.png"
            alt="Madero Restó"
            width={480}
            height={231}
            priority
            className="h-11 w-auto"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLoyalty(true)}
              aria-label="Mi tarjeta de fidelidad"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-stone-300 transition hover:border-white/25"
            >
              <Star className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              aria-label="Mis pedidos"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-stone-300 transition hover:border-white/25"
            >
              <Receipt className="h-4 w-4" />
            </button>
            <a
              href="#reservas"
              className="rounded-full border border-ember/40 px-4 py-1.5 text-sm text-ember-soft transition hover:bg-ember/10"
            >
              Reservar
            </a>
          </div>
        </div>
      </header>

      {/* Fuera del <header>: su backdrop-blur-md crea un containing block para
          "position: fixed" y rompía el posicionamiento de estos modales. */}
      {showHistory && <OrderHistoryModal onClose={() => setShowHistory(false)} />}
      {showLoyalty && <LoyaltyCardModal onClose={() => setShowLoyalty(false)} />}
    </>
  );
}
