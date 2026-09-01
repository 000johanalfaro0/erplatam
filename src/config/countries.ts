export const COUNTRIES = {
  PE: { name: "Perú", currency: "PEN", locale: "es-PE", timezone: "America/Lima", taxRateBps: 1800 },
  MX: { name: "México", currency: "MXN", locale: "es-MX", timezone: "America/Mexico_City", taxRateBps: 1600 },
  CO: { name: "Colombia", currency: "COP", locale: "es-CO", timezone: "America/Bogota", taxRateBps: 1900 },
  EC: { name: "Ecuador", currency: "USD", locale: "es-EC", timezone: "America/Guayaquil", taxRateBps: 1500 },
  CL: { name: "Chile", currency: "CLP", locale: "es-CL", timezone: "America/Santiago", taxRateBps: 1900 },
  AR: { name: "Argentina", currency: "ARS", locale: "es-AR", timezone: "America/Argentina/Buenos_Aires", taxRateBps: 2100 },
} as const;

export type CountryCode = keyof typeof COUNTRIES;
export const COUNTRY_OPTIONS = Object.entries(COUNTRIES).map(([code, value]) => ({ code: code as CountryCode, ...value }));
