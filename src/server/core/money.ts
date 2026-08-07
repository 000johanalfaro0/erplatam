/**
 * Aritmética de dinero y cantidades — SIN punto flotante.
 *
 * Todo el sistema representa:
 *   - dinero    -> enteros en CENTAVOS        ($1,234.56 = 123456)
 *   - cantidad  -> enteros en MILI-UNIDADES   (2.5 kg    = 2500)
 *   - tasas     -> enteros en BASIS POINTS    (16%       = 1600)
 *
 * Motivo: `0.1 + 0.2 !== 0.3` en IEEE-754. En un sistema que suma miles de
 * líneas de venta al día, ese error se acumula y termina en un corte de caja
 * que no cuadra. Con enteros el resultado es exacto y los tests son
 * deterministas.
 *
 * Este módulo es puro: no importa Prisma, ni Next, ni nada. Es el archivo con
 * mayor densidad de tests del proyecto.
 */

export const CENTS_PER_UNIT = 100;
export const MILLI_PER_UNIT = 1000;
export const BPS_PER_UNIT = 10_000;

/** Techo de seguridad para multiplicaciones intermedias. */
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function assertSafe(value: number, context: string): number {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_SAFE) {
    throw new RangeError(
      `Desbordamiento aritmético en ${context}: el valor excede el rango seguro.`,
    );
  }
  return value;
}

/**
 * Redondeo comercial: mitad hacia afuera del cero.
 * 2.5 -> 3 ; -2.5 -> -3
 *
 * `Math.round` no sirve para importes negativos porque redondea hacia +∞
 * (`Math.round(-2.5) === -2`), lo que introduce asimetría entre una venta y su
 * nota de crédito.
 */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

// ---------------------------------------------------------------------------
// Conversión de entrada del usuario
// ---------------------------------------------------------------------------

/**
 * Convierte lo que el usuario escribe ("1,234.56", "1234.5", 1234.56) a
 * centavos. Rechaza cualquier cosa que no sea un importe legítimo.
 */
export function parseMoneyToCents(input: string | number): number {
  const normalized =
    typeof input === "number"
      ? String(input)
      : input.trim().replace(/[\s,$]/g, "");

  if (normalized === "") {
    throw new RangeError("Importe vacío");
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new RangeError(
      `Importe inválido: "${input}". Usa hasta dos decimales.`,
    );
  }

  const [whole, fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const wholeCents = Math.abs(Number(whole)) * CENTS_PER_UNIT;
  const fractionCents = Number(fraction.padEnd(2, "0"));

  return assertSafe(sign * (wholeCents + fractionCents), "parseMoneyToCents");
}

/**
 * Convierte una cantidad escrita por el usuario ("2.5", "3") a mili-unidades.
 * Tres decimales es el límite: permite gramos dentro de kilos.
 */
export function parseQuantityToMilli(input: string | number): number {
  const normalized =
    typeof input === "number" ? String(input) : input.trim().replace(/,/g, "");

  if (normalized === "") {
    throw new RangeError("Cantidad vacía");
  }

  if (!/^-?\d+(\.\d{1,3})?$/.test(normalized)) {
    throw new RangeError(
      `Cantidad inválida: "${input}". Usa hasta tres decimales.`,
    );
  }

  const [whole, fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const wholeMilli = Math.abs(Number(whole)) * MILLI_PER_UNIT;
  const fractionMilli = Number(fraction.padEnd(3, "0"));

  return assertSafe(sign * (wholeMilli + fractionMilli), "parseQuantityToMilli");
}

// ---------------------------------------------------------------------------
// Operaciones de línea
// ---------------------------------------------------------------------------

/**
 * Importe de una línea: cantidad (mili-unidades) × precio unitario (centavos).
 *
 * El divisor 1000 convierte de mili-unidades a unidades. Se redondea una sola
 * vez, al final, para no arrastrar error entre líneas.
 */
export function lineAmountCents(
  quantityMilli: number,
  unitPriceCents: number,
): number {
  const raw = assertSafe(
    quantityMilli * unitPriceCents,
    "lineAmountCents (producto intermedio)",
  );
  return roundHalfUp(raw / MILLI_PER_UNIT);
}

/** Aplica una tasa en basis points sobre una base en centavos. */
export function applyRateBps(baseCents: number, rateBps: number): number {
  const raw = assertSafe(baseCents * rateBps, "applyRateBps");
  return roundHalfUp(raw / BPS_PER_UNIT);
}

/**
 * Descompone un importe que YA incluye impuesto.
 *
 * Es el caso normal del comercio mexicano al menudeo: en el anaquel dice $116
 * y esos $116 ya traen el IVA dentro. Hay que extraerlo, no sumarlo.
 *
 *   base = total * 10000 / (10000 + rateBps)
 *   impuesto = total - base
 *
 * El impuesto se calcula por resta para garantizar que base + impuesto sea
 * exactamente el total, sin centavo perdido por doble redondeo.
 */
export function splitTaxIncluded(
  totalCents: number,
  rateBps: number,
): { baseCents: number; taxCents: number } {
  if (rateBps === 0) {
    return { baseCents: totalCents, taxCents: 0 };
  }

  const raw = assertSafe(totalCents * BPS_PER_UNIT, "splitTaxIncluded");
  const baseCents = roundHalfUp(raw / (BPS_PER_UNIT + rateBps));

  return { baseCents, taxCents: totalCents - baseCents };
}

/** Añade impuesto sobre una base que NO lo incluye. */
export function addTaxExcluded(
  baseCents: number,
  rateBps: number,
): { baseCents: number; taxCents: number; totalCents: number } {
  const taxCents = applyRateBps(baseCents, rateBps);
  return { baseCents, taxCents, totalCents: baseCents + taxCents };
}

// ---------------------------------------------------------------------------
// Formato de salida (es-MX)
// ---------------------------------------------------------------------------

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(locale: string, currency: string) {
  const key = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, formatter);
  }

  return formatter;
}

/** 123456 -> "$1,234.56" */
export function formatMoney(
  cents: number,
  locale = "es-MX",
  currency = "MXN",
): string {
  return getCurrencyFormatter(locale, currency).format(cents / CENTS_PER_UNIT);
}

/** 2500 -> "2.5" (sin ceros decorativos) */
export function formatQuantity(milli: number): string {
  const value = milli / MILLI_PER_UNIT;
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** 1600 -> "16%" */
export function formatRateBps(rateBps: number): string {
  const percent = rateBps / 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

/** Centavos a número decimal. Solo para exportación (CSV/JSON), nunca para operar. */
export function centsToDecimal(cents: number): number {
  return Number((cents / CENTS_PER_UNIT).toFixed(2));
}

/** Mili-unidades a número decimal. Solo para exportación. */
export function milliToDecimal(milli: number): number {
  return Number((milli / MILLI_PER_UNIT).toFixed(3));
}
