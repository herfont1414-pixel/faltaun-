"use client";

import { CheckoutPanel } from "@/components/menu/checkout-panel";

interface CheckoutModalProps {
  onClose: () => void;
}

export function CheckoutModal({ onClose }: CheckoutModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-base-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CheckoutPanel onClose={onClose} />
      </div>
    </div>
  );
}
