import { describe, expect, it } from "vitest";

import { computeLine, sumDocument } from "@/server/core/pricing";

describe("computeLine — precio con IVA incluido (menudeo)", () => {
  it("descompone el precio de anaquel", () => {
    // 1 pieza a $116.00 con IVA 16% dentro
    const line = computeLine({
      quantityMilli: 1000,
      unitPriceCents: 11600,
      taxRateBps: 1600,
      priceIncludesTax: true,
    });

    expect(line).toEqual({
      subtotalCents: 10000,
      taxCents: 1600,
      totalCents: 11600,
    });
  });

  it("el total coincide con lo que el cliente lee en la etiqueta", () => {
    // Requisito de negocio: 3 × $29.90 debe cobrar exactamente $89.70,
    // pase lo que pase con el reparto interno del impuesto.
    const line = computeLine({
      quantityMilli: 3000,
      unitPriceCents: 2990,
      taxRateBps: 1600,
      priceIncludesTax: true,
    });

    expect(line.totalCents).toBe(8970);
    expect(line.subtotalCents + line.taxCents).toBe(8970);
  });

  it("aplica el descuento antes de descomponer el impuesto", () => {
    const line = computeLine({
      quantityMilli: 1000,
      unitPriceCents: 11600,
      discountCents: 1600,
      taxRateBps: 1600,
      priceIncludesTax: true,
    });

    expect(line.totalCents).toBe(10000);
    expect(line.subtotalCents + line.taxCents).toBe(10000);
  });
});

describe("computeLine — precio sin IVA (mayoreo y proveedores)", () => {
  it("suma el impuesto sobre la base", () => {
    const line = computeLine({
      quantityMilli: 1000,
      unitPriceCents: 10000,
      taxRateBps: 1600,
      priceIncludesTax: false,
    });

    expect(line).toEqual({
      subtotalCents: 10000,
      taxCents: 1600,
      totalCents: 11600,
    });
  });
});

describe("computeLine — tasa cero y exentos", () => {
  it("no grava productos de tasa 0 (alimentos básicos, medicinas)", () => {
    const line = computeLine({
      quantityMilli: 2500, // 2.5 kg
      unitPriceCents: 4500, // $45.00/kg
      taxRateBps: 0,
      priceIncludesTax: true,
    });

    expect(line).toEqual({
      subtotalCents: 11250,
      taxCents: 0,
      totalCents: 11250,
    });
  });
});

describe("sumDocument", () => {
  const lineGravada = computeLine({
    quantityMilli: 1000,
    unitPriceCents: 11600,
    taxRateBps: 1600,
    priceIncludesTax: true,
  });

  const lineExenta = computeLine({
    quantityMilli: 1000,
    unitPriceCents: 5000,
    taxRateBps: 0,
    priceIncludesTax: true,
  });

  it("suma un ticket mixto", () => {
    const totals = sumDocument([lineGravada, lineExenta]);

    expect(totals.subtotalCents).toBe(15000); // 10000 + 5000
    expect(totals.taxCents).toBe(1600);
    expect(totals.totalCents).toBe(16600);
  });

  it("mantiene la identidad subtotal - descuento + impuesto = total", () => {
    const totals = sumDocument([lineGravada, lineExenta], 2500);

    expect(
      totals.subtotalCents - totals.discountCents + totals.taxCents,
    ).toBe(totals.totalCents);
  });

  it("nunca descuenta más que la base", () => {
    const totals = sumDocument([lineExenta], 999_999);
    expect(totals.discountCents).toBe(5000);
    expect(totals.totalCents).toBe(0);
  });

  it("un documento vacío suma cero", () => {
    expect(sumDocument([])).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      discountCents: 0,
      totalCents: 0,
    });
  });
});
