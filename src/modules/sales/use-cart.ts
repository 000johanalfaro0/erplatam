"use client";

import * as React from "react";

import { computeLine, sumDocument } from "@/server/core/pricing";

/**
 * Estado del carrito del punto de venta.
 *
 * DECISIÓN IMPORTANTE: los totales se calculan en el cliente con EXACTAMENTE
 * las mismas funciones puras que usa el servidor (`computeLine`,
 * `sumDocument`), importadas del mismo archivo.
 *
 * No es duplicación: es la misma implementación ejecutándose en dos sitios.
 * Y es lo que garantiza que el total que el cajero anuncia en voz alta sea, al
 * centavo, el que el servidor va a cobrar. Reimplementar el cálculo en el
 * cliente "para que se vea rápido" es como se producen los descuadres de caja.
 *
 * El servidor NO confía en estos números: recalcula todo y rechaza la venta si
 * los pagos no cuadran. El cálculo del cliente es para mostrar, no para
 * decidir.
 */

export interface CartProduct {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
  unit: string;
  tracksInventory: boolean;
  taxRateBps: number;
}

export interface CartLine {
  product: CartProduct;
  /** Mili-unidades. */
  quantity: number;
  /** Precio aplicado; por defecto el del catálogo. */
  unitPriceCents: number;
  discountCents: number;
}

export interface CartTotals {
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
}

export function useCart(pricesIncludeTax: boolean) {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [documentDiscountCents, setDocumentDiscount] = React.useState(0);

  /**
   * Agrega un producto. Si ya está en el carrito al mismo precio, incrementa
   * la cantidad en lugar de crear un renglón nuevo: escanear tres veces el
   * mismo refresco debe dar "3", no tres líneas de 1.
   */
  const addProduct = React.useCallback(
    (product: CartProduct, quantity = 1000) => {
      setLines((current) => {
        const index = current.findIndex(
          (line) =>
            line.product.id === product.id &&
            line.unitPriceCents === product.priceCents,
        );

        if (index >= 0) {
          const next = [...current];
          next[index] = {
            ...next[index],
            quantity: next[index].quantity + quantity,
          };
          return next;
        }

        return [
          ...current,
          {
            product,
            quantity,
            unitPriceCents: product.priceCents,
            discountCents: 0,
          },
        ];
      });
    },
    [],
  );

  const setQuantity = React.useCallback((productId: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.product.id !== productId)
        : current.map((line) =>
            line.product.id === productId ? { ...line, quantity } : line,
          ),
    );
  }, []);

  const setUnitPrice = React.useCallback((productId: string, cents: number) => {
    setLines((current) =>
      current.map((line) =>
        line.product.id === productId ? { ...line, unitPriceCents: cents } : line,
      ),
    );
  }, []);

  const removeLine = React.useCallback((productId: string) => {
    setLines((current) => current.filter((line) => line.product.id !== productId));
  }, []);

  const clear = React.useCallback(() => {
    setLines([]);
    setDocumentDiscount(0);
  }, []);

  /** Totales, recalculados en cada cambio con la lógica del servidor. */
  const totals: CartTotals = React.useMemo(() => {
    const computed = lines.map((line) =>
      computeLine({
        quantityMilli: line.quantity,
        unitPriceCents: line.unitPriceCents,
        discountCents: line.discountCents,
        taxRateBps: line.product.taxRateBps,
        priceIncludesTax: pricesIncludeTax,
      }),
    );

    return sumDocument(computed, documentDiscountCents);
  }, [lines, documentDiscountCents, pricesIncludeTax]);

  /** Importe de una línea concreta, para mostrarlo en la tabla. */
  const lineTotal = React.useCallback(
    (line: CartLine) =>
      computeLine({
        quantityMilli: line.quantity,
        unitPriceCents: line.unitPriceCents,
        discountCents: line.discountCents,
        taxRateBps: line.product.taxRateBps,
        priceIncludesTax: pricesIncludeTax,
      }).totalCents,
    [pricesIncludeTax],
  );

  /**
   * Líneas que exceden la existencia disponible.
   *
   * Es un aviso del cliente, no la validación real: el servidor comprueba el
   * stock bajo bloqueo de fila, que es lo único fiable con varias cajas
   * activas. Esto solo evita que el cajero llegue hasta el cobro para
   * enterarse.
   */
  const stockWarnings = React.useMemo(
    () =>
      lines.filter(
        (line) =>
          line.product.tracksInventory && line.quantity > line.product.stock,
      ),
    [lines],
  );

  return {
    lines,
    totals,
    documentDiscountCents,
    setDocumentDiscount,
    addProduct,
    setQuantity,
    setUnitPrice,
    removeLine,
    clear,
    lineTotal,
    stockWarnings,
    isEmpty: lines.length === 0,
    itemCount: lines.length,
  };
}
