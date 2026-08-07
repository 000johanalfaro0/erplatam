import {
  addTaxExcluded,
  applyRateBps,
  lineAmountCents,
  splitTaxIncluded,
} from "./money";

/**
 * Motor de cálculo de líneas de documento.
 *
 * Compartido por ventas y compras: ambas necesitan exactamente la misma
 * descomposición (base imponible, impuesto, total) y duplicarla sería la vía
 * más rápida a que un ticket y su reporte no cuadren.
 *
 * Puro: sin base de datos, sin fechas, sin aleatoriedad. Totalmente testeable.
 */

export interface LineInput {
  /** Mili-unidades. */
  quantityMilli: number;
  /** Precio o costo unitario en centavos, tal como se capturó. */
  unitPriceCents: number;
  /** Descuento de la línea en centavos, aplicado sobre el importe bruto. */
  discountCents?: number;
  /** Tasa en basis points. 1600 = 16%, 0 = tasa cero o exento. */
  taxRateBps: number;
  /** Si `unitPriceCents` ya incluye el impuesto. */
  priceIncludesTax: boolean;
}

export interface LineTotals {
  /** Base imponible: importe sin impuesto y ya con el descuento aplicado. */
  subtotalCents: number;
  taxCents: number;
  /** subtotal + impuesto. Es lo que el cliente paga por esta línea. */
  totalCents: number;
}

/**
 * Calcula una línea.
 *
 * Los dos modos existen porque conviven en el comercio mexicano:
 *
 *   - `priceIncludesTax = true`  → el precio del anaquel es $116 y el IVA va
 *     dentro. Es lo habitual al menudeo, y es el que evita que el cliente vea
 *     un total distinto al que leyó en la etiqueta.
 *
 *   - `priceIncludesTax = false` → el precio es $100 y el IVA se suma aparte.
 *     Es lo habitual al mayoreo y con proveedores.
 *
 * El descuento se aplica SIEMPRE sobre el importe bruto antes de descomponer
 * el impuesto: descontar sobre la base y luego gravar daría un total distinto
 * al que espera el cajero.
 */
export function computeLine(input: LineInput): LineTotals {
  const { quantityMilli, unitPriceCents, taxRateBps, priceIncludesTax } = input;
  const discountCents = input.discountCents ?? 0;

  const grossCents = lineAmountCents(quantityMilli, unitPriceCents);
  const afterDiscountCents = grossCents - discountCents;

  if (priceIncludesTax) {
    const { baseCents, taxCents } = splitTaxIncluded(
      afterDiscountCents,
      taxRateBps,
    );
    return {
      subtotalCents: baseCents,
      taxCents,
      totalCents: afterDiscountCents,
    };
  }

  const { taxCents } = addTaxExcluded(afterDiscountCents, taxRateBps);
  return {
    subtotalCents: afterDiscountCents,
    taxCents,
    totalCents: afterDiscountCents + taxCents,
  };
}

export interface DocumentTotals {
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
}

/**
 * Suma las líneas y aplica un descuento a nivel documento.
 *
 * El descuento global se reparte proporcionalmente entre las bases gravadas
 * para no distorsionar el impuesto: descontar $100 sobre un ticket mixto de
 * productos al 16% y al 0% y cargarlo todo a una sola tasa produciría un
 * impuesto incorrecto.
 *
 * El último renglón absorbe el residuo del reparto, de modo que la suma de las
 * partes siempre es igual al total.
 */
export function sumDocument(
  lines: readonly LineTotals[],
  documentDiscountCents = 0,
): DocumentTotals {
  const subtotalCents = lines.reduce((acc, l) => acc + l.subtotalCents, 0);
  const taxCents = lines.reduce((acc, l) => acc + l.taxCents, 0);

  if (documentDiscountCents <= 0) {
    return {
      subtotalCents,
      taxCents,
      discountCents: 0,
      totalCents: subtotalCents + taxCents,
    };
  }

  // El descuento no puede superar la base.
  const discountCents = Math.min(documentDiscountCents, subtotalCents);

  // Reparto proporcional del descuento sobre el impuesto ya calculado.
  const ratioBps =
    subtotalCents === 0
      ? 0
      : Math.round(((subtotalCents - discountCents) * 10_000) / subtotalCents);

  const adjustedTaxCents = applyRateBps(taxCents, ratioBps);

  return {
    subtotalCents,
    taxCents: adjustedTaxCents,
    discountCents,
    totalCents: subtotalCents - discountCents + adjustedTaxCents,
  };
}
