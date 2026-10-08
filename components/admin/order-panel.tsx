"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { money } from "@/lib/admin/format";
import { PaymentPicker } from "@/components/admin/payment-picker";
import type { Catalog, Order, PaymentMethod } from "@/lib/admin/types";

interface OrderPanelProps {
  order: Order | null;
  tableNumber: number | null;
  titleOverride?: string | null;
  catalog: Catalog;
  activeCategory: string;
  onChangeCategory: (category: string) => void;
  onAddProduct: (name: string, price: number) => void;
  onChangeQty: (itemId: string, delta: number) => void;
  onClose: () => void;
  onSendKitchen: () => void;
  onRequestBill: () => void;
  onFinalize: (method: PaymentMethod, customerId: number | null, loyaltyPhone: string | null) => void;
  onChangeDeliveryStatus?: (status: "preparando" | "en_camino" | "entregado") => void;
}

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
};

export function OrderPanel({
  order,
  tableNumber,
  titleOverride,
  catalog,
  activeCategory,
  onChangeCategory,
  onAddProduct,
  onChangeQty,
  onClose,
  onSendKitchen,
  onRequestBill,
  onFinalize,
  onChangeDeliveryStatus,
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
              {titleOverride ?? (tableNumber ? `Mesa ${tableNumber}` : "Pedido de mostrador")}
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

        {categories.length > 1 && (
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
        )}

        <div className="product-list">
          {products.map((product) => (
            <button
              key={product.name}
              type="button"
              className={`product-btn ${product.inStock ? "" : "sin-stock"}`}
              disabled={!product.inStock}
              onClick={() => onAddProduct(product.name, product.price)}
            >
              <div className="p-name">
                {product.name}
                {!product.inStock && <span className="p-badge">Sin stock</span>}
              </div>
              <div className="p-price">{money(product.price)}</div>
            </button>
          ))}
        </div>

        {order.isDelivery && (
          <div className="delivery-info">
            <div>
              {order.customerName} · {order.customerPhone}
            </div>
            <div>{order.customerAddress}</div>
            {order.deliveryZone && (
              <div>
                Zona: {order.deliveryZone} · Envío {money(order.shippingCost)}
              </div>
            )}
            {onChangeDeliveryStatus && (
              <div className="delivery-status-row">
                {(["preparando", "en_camino", "entregado"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`btn btn-sm ${order.deliveryStatus === status ? "active" : ""}`}
                    onClick={() => onChangeDeliveryStatus(status)}
                  >
                    {DELIVERY_STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
          {order.isDelivery && order.shippingCost > 0 && (
            <div className="ticket-item">
              <div />
              <div className="ti-name">Envío</div>
              <div className="ti-price">{money(order.shippingCost)}</div>
            </div>
          )}
        </div>

        {showPayment ? (
          <PaymentPicker
            total={order.total}
            onCancel={() => setShowPayment(false)}
            onConfirm={(method, customerId, loyaltyPhone) => {
              setShowPayment(false);
              onFinalize(method, customerId, loyaltyPhone);
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
