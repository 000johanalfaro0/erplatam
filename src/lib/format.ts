import { TZDate } from "@date-fns/tz";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formato para México (requisito 12).
 *
 * La moneda, la configuración regional y la zona horaria NO están codificadas
 * a fuego: llegan desde `BusinessSettings`. El cliente es mexicano hoy, pero la
 * arquitectura no debe dar eso por sentado.
 *
 * Sobre la zona horaria: el servidor guarda todo en UTC (Postgres
 * `timestamptz`). La conversión a hora local ocurre SOLO al presentar. Si se
 * guardara en hora local, el corte del día se rompería con el horario de
 * verano y los reportes diarios saldrían mal dos veces al año.
 */

export interface FormatSettings {
  currency: string;
  locale: string;
  timezone: string;
}

export const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
  currency: "MXN",
  locale: "es-MX",
  timezone: "America/Mexico_City",
};

const currencyCache = new Map<string, Intl.NumberFormat>();

/**
 * Centavos a moneda. 123456 -> "$1,234.56"
 *
 * Recibe SIEMPRE centavos enteros, nunca un decimal: el punto flotante no
 * entra en el sistema ni siquiera para mostrar.
 */
export function money(
  cents: number,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
): string {
  const key = `${settings.locale}:${settings.currency}`;
  let formatter = currencyCache.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat(settings.locale, {
      style: "currency",
      currency: settings.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyCache.set(key, formatter);
  }

  return formatter.format(cents / 100);
}

/**
 * Versión compacta para tarjetas del panel: "$12.4k", "$1.2M".
 * Solo para cifras de resumen; nunca para un importe que deba cuadrar.
 */
export function moneyCompact(
  cents: number,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
): string {
  const value = cents / 100;

  if (Math.abs(value) < 10_000) return money(cents, settings);

  return new Intl.NumberFormat(settings.locale, {
    style: "currency",
    currency: settings.currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Mili-unidades a texto. 2500 -> "2.5" */
export function quantity(milli: number): string {
  const value = milli / 1000;
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(3)));
}

/** Mili-unidades con su unidad. 2500, "KG" -> "2.5 kg" */
export function quantityWithUnit(milli: number, unit: string): string {
  return `${quantity(milli)} ${UNIT_LABELS[unit] ?? unit.toLowerCase()}`;
}

export const UNIT_LABELS: Record<string, string> = {
  PIECE: "pz",
  KG: "kg",
  G: "g",
  L: "L",
  ML: "ml",
  BOX: "caja",
  PACK: "paq",
  SERVICE: "serv",
};

export const UNIT_OPTIONS = [
  { value: "PIECE", label: "Pieza" },
  { value: "KG", label: "Kilogramo" },
  { value: "G", label: "Gramo" },
  { value: "L", label: "Litro" },
  { value: "ML", label: "Mililitro" },
  { value: "BOX", label: "Caja" },
  { value: "PACK", label: "Paquete" },
  { value: "SERVICE", label: "Servicio" },
] as const;

/** Basis points a porcentaje. 1600 -> "16%" */
export function percent(bps: number): string {
  const value = bps / 100;
  return `${Number.isInteger(value) ? value : Number(value.toFixed(2))}%`;
}

function toZoned(value: Date | string, timezone: string): TZDate {
  const date = typeof value === "string" ? new Date(value) : value;
  return new TZDate(date, timezone);
}

/** Fecha corta en la zona del negocio: "6 ago 2026" */
export function dateShort(
  value: Date | string,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
): string {
  return format(toZoned(value, settings.timezone), "d MMM yyyy", { locale: es });
}

/** Fecha y hora: "6 ago 2026, 14:32" */
export function dateTime(
  value: Date | string,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
): string {
  return format(toZoned(value, settings.timezone), "d MMM yyyy, HH:mm", {
    locale: es,
  });
}

/** Solo la hora: "14:32" */
export function timeOnly(
  value: Date | string,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
): string {
  return format(toZoned(value, settings.timezone), "HH:mm", { locale: es });
}

/**
 * Fecha relativa legible para listas de actividad.
 * Hoy y ayer se nombran; más atrás se da la fecha, que es más útil que
 * "hace 9 días".
 */
export function dateRelative(
  value: Date | string,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
): string {
  const zoned = toZoned(value, settings.timezone);

  if (isToday(zoned)) return `Hoy, ${timeOnly(value, settings)}`;
  if (isYesterday(zoned)) return `Ayer, ${timeOnly(value, settings)}`;

  return dateTime(value, settings);
}

/** "hace 5 minutos" — para la bitácora de auditoría. */
export function timeAgo(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `hace ${formatDistanceToNowStrict(date, { locale: es })}`;
}

/** Formato de fecha para inputs `type="date"`: "2026-08-06" */
export function dateInputValue(
  value: Date | string,
  timezone = DEFAULT_FORMAT_SETTINGS.timezone,
): string {
  return format(toZoned(value, timezone), "yyyy-MM-dd");
}

/** Entero con separadores de millar. */
export function number(
  value: number,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
): string {
  return new Intl.NumberFormat(settings.locale).format(value);
}
