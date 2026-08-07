import { describe, expect, it } from "vitest";

import {
  addTaxExcluded,
  applyRateBps,
  centsToDecimal,
  formatMoney,
  formatQuantity,
  formatRateBps,
  lineAmountCents,
  parseMoneyToCents,
  parseQuantityToMilli,
  roundHalfUp,
  splitTaxIncluded,
} from "@/server/core/money";

describe("roundHalfUp", () => {
  it("redondea la mitad hacia arriba en positivos", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(0.5)).toBe(1);
  });

  it("redondea simétricamente en negativos", () => {
    // Esta es la razón de existir de la función: Math.round(-2.5) === -2,
    // lo que haría que una devolución no cuadrara con su venta.
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(-2.4)).toBe(-2);
    expect(Math.round(-2.5)).not.toBe(roundHalfUp(-2.5));
  });
});

describe("parseMoneyToCents", () => {
  it("convierte importes con y sin formato", () => {
    expect(parseMoneyToCents("1234.56")).toBe(123456);
    expect(parseMoneyToCents("1,234.56")).toBe(123456);
    expect(parseMoneyToCents("$1,234.56")).toBe(123456);
    expect(parseMoneyToCents("100")).toBe(10000);
    expect(parseMoneyToCents("0.05")).toBe(5);
    expect(parseMoneyToCents(1234.56)).toBe(123456);
  });

  it("completa el segundo decimal", () => {
    expect(parseMoneyToCents("10.5")).toBe(1050);
  });

  it("acepta negativos", () => {
    expect(parseMoneyToCents("-25.30")).toBe(-2530);
  });

  it("rechaza entradas inválidas", () => {
    expect(() => parseMoneyToCents("abc")).toThrow();
    expect(() => parseMoneyToCents("")).toThrow();
    expect(() => parseMoneyToCents("1.234")).toThrow(); // 3 decimales
    expect(() => parseMoneyToCents("1.2.3")).toThrow();
  });

  it("no pierde precisión donde el punto flotante sí la pierde", () => {
    // 0.1 + 0.2 === 0.30000000000000004 en IEEE-754.
    const a = parseMoneyToCents("0.10");
    const b = parseMoneyToCents("0.20");
    expect(a + b).toBe(parseMoneyToCents("0.30"));
  });
});

describe("parseQuantityToMilli", () => {
  it("convierte cantidades a mili-unidades", () => {
    expect(parseQuantityToMilli("1")).toBe(1000);
    expect(parseQuantityToMilli("2.5")).toBe(2500);
    expect(parseQuantityToMilli("0.125")).toBe(125);
    expect(parseQuantityToMilli(3)).toBe(3000);
  });

  it("rechaza más de tres decimales", () => {
    expect(() => parseQuantityToMilli("1.2345")).toThrow();
  });
});

describe("lineAmountCents", () => {
  it("calcula cantidad por precio unitario", () => {
    // 3 piezas a $25.00
    expect(lineAmountCents(3000, 2500)).toBe(7500);
  });

  it("maneja cantidades fraccionarias", () => {
    // 2.5 kg a $45.00/kg = $112.50
    expect(lineAmountCents(2500, 4500)).toBe(11250);
  });

  it("redondea a centavo el resultado, no los operandos", () => {
    // 0.333 kg a $10.00/kg = $3.33
    expect(lineAmountCents(333, 1000)).toBe(333);
    // 1.005 unidades a $9.99 = 10.03995 -> 1004 centavos
    expect(lineAmountCents(1005, 999)).toBe(1004);
  });
});

describe("splitTaxIncluded", () => {
  it("extrae el IVA de un precio que ya lo incluye", () => {
    // $116.00 con IVA 16% incluido -> base $100.00, IVA $16.00
    const { baseCents, taxCents } = splitTaxIncluded(11600, 1600);
    expect(baseCents).toBe(10000);
    expect(taxCents).toBe(1600);
  });

  it("garantiza que base + impuesto sea exactamente el total", () => {
    // Propiedad crítica: ningún centavo puede desaparecer por redondeo.
    for (let total = 1; total <= 2000; total++) {
      const { baseCents, taxCents } = splitTaxIncluded(total, 1600);
      expect(baseCents + taxCents).toBe(total);
    }
  });

  it("con tasa 0 devuelve todo como base", () => {
    expect(splitTaxIncluded(5000, 0)).toEqual({
      baseCents: 5000,
      taxCents: 0,
    });
  });
});

describe("addTaxExcluded", () => {
  it("suma el IVA sobre una base sin impuesto", () => {
    expect(addTaxExcluded(10000, 1600)).toEqual({
      baseCents: 10000,
      taxCents: 1600,
      totalCents: 11600,
    });
  });

  it("soporta tasa 0 (alimentos básicos)", () => {
    expect(addTaxExcluded(4550, 0)).toEqual({
      baseCents: 4550,
      taxCents: 0,
      totalCents: 4550,
    });
  });
});

describe("applyRateBps", () => {
  it("aplica tasas arbitrarias", () => {
    expect(applyRateBps(10000, 1600)).toBe(1600); // 16%
    expect(applyRateBps(10000, 800)).toBe(800); // 8% (franja fronteriza)
    expect(applyRateBps(333, 1600)).toBe(53); // 53.28 -> 53
  });
});

describe("formato", () => {
  it("formatea moneda mexicana", () => {
    // Intl usa espacio no separable en algunas versiones; normalizamos.
    expect(formatMoney(123456).replace(/ /g, " ")).toBe("$1,234.56");
    expect(formatMoney(0).replace(/ /g, " ")).toBe("$0.00");
  });

  it("formatea cantidades sin ceros decorativos", () => {
    expect(formatQuantity(3000)).toBe("3");
    expect(formatQuantity(2500)).toBe("2.5");
    expect(formatQuantity(125)).toBe("0.125");
  });

  it("formatea tasas", () => {
    expect(formatRateBps(1600)).toBe("16%");
    expect(formatRateBps(0)).toBe("0%");
    expect(formatRateBps(825)).toBe("8.25%");
  });

  it("convierte a decimal solo para exportación", () => {
    expect(centsToDecimal(123456)).toBe(1234.56);
  });
});
