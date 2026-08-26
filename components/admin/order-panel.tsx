"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { money } from "@/lib/admin/format";
import { PaymentPicker } from "@/components/admin/payment-picker";
import type { Catalog, Order, PaymentMethod } from "@/lib/admin/types";

interface OrderPanelProps {
  order: Order | null;
  tableNumber: number | null;
  catalog: Catalog;
  activeCategory: string;
  onChangeCategory: (category: string) => void;
  onAddProduct: (name: string, price: number) => void;
  onChangeQty: (itemId: string, delta: number) => void;
  onClose: () => void;
  onSendKitchen: () => void;
  onRequestBill: () => void;
  onFinalize: (method: PaymentMethod, customerId: number | null) => void;
}

export function OrderPanel({
  order,
  tableNumber,
  catalog,
  activeCategory,
  onChangeCategory,
  onAddProduct,
  onChangeQty,
  onClose,
  onSendKitchen,
  onRequestBill,
  onFinalize,
}: OrderPanelProps) {
  const [showPayment, setShowPayment] = useState(false);

  if (!order) {
    return (
      <div className="side-panel">
        <div className="empty-hint">‹ Seleccioná una mesa</div>
      </div>
    );
  }

  const categories = Object.keys(catalog);
  const products = catalog[activeCategory] ?? [];

  return (
    <div className="side-panel show">
      <div className="order-panel">
        <div className="op-header">
          <div>
            <div className="op-title">
              {tableNumber ? `Mesa ${tableNumber}` : "Pedido de mostrador"}
            </div>
            <div className="op-sub">{order.items.length} producto(s)</div>
          </div>
          <button
            type="button"
            className="op-close"
            onClick={() => {
              setShowPayment(false);
              onClose();
            }}
          >
            <X className="mx-auto h-4 w-4" />
          </button>
        </div>

        <div className="cat-tabs">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`cat-tab ${cat === activeCategory ? "active" : ""}`}
              onClick={() => onChangeCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="product-list">
          {products.map((product) => (
            <button
              key={product.name}
              type="button"
              className="product-btn"
              onClick={() => onAddProduct(product.name, product.price)}
            >
              <div className="p-name">{product.name}</div>
              <div className="p-price">{money(product.price)}</div>
            </button>
          ))}
        </div>

        <div className="ticket-wrap">
          <div className="ticket-title">Pedido actual</div>
          {order.items.length === 0 ? (
            <div className="ticket-empty">Todavía no agregaste productos</div>
          ) : (
            order.items.map((item) => (
              <div key={item.id} className="ticket-item">
                <div className="qty-ctrl">
                  <button type="button" onClick={() => onChangeQty(item.id, -1)}>
                    −
                  </button>
                  <span>{item.qty}</span>
                  <button type="button" onClick={() => onChangeQty(item.id, 1)}>
                    +
                  </button>
                </div>
                <div className="ti-name">
                  {item.name}
                  {item.sentToKitchen && <span style={{ color: "var(--text-faint)" }}> · enviado</span>}
                </div>
                <div className="ti-price">{money(item.price * item.qty)}</div>
              </div>
            ))
          )}
        </div>

        {showPayment ? (
          <PaymentPicker
            total={order.total}
            onCancel={() => setShowPayment(false)}
            onConfirm={(method, customerId) => {
              setShowPayment(false);
              onFinalize(method, customerId);
            }}
          />
        ) : (
          <div className="op-footer">
            <div className="total-row">
              <span className="tl-label">Total</span>
              <span className="tl-value">{money(order.total)}</span>
            </div>
            <div className="footer-actions">
              <button type="button" className="btn" onClick={onSendKitchen}>
                Enviar a cocina
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setShowPayment(true)}>
                Cobrar
              </button>
            </div>
            {tableNumber && (
              <div className="footer-actions footer-row2">
                <button type="button" className="btn" onClick={onRequestBill}>
                  Pedir cuenta
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
