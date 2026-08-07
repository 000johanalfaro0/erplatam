import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { salesByPeriod } from "@/server/modules/reports";
import { createSale } from "@/server/modules/sales";

import {
  type TestEnvironment,
  createTestEnvironment,
  createTestProduct,
  db,
} from "../helpers/db";

/**
 * ZONA HORARIA EN LOS REPORTES
 * ===========================================================================
 * Prueba de regresión de un bug real que estuvo en el código.
 *
 * Prisma guarda `DateTime` como `timestamp WITHOUT time zone` con valores en
 * UTC. La versión anterior de la consulta hacía:
 *
 *     "createdAt" AT TIME ZONE 'America/Mexico_City'
 *
 * Postgres interpretaba el valor UTC como si YA fuera hora de México y lo
 * convertía a UTC: desplazaba +6 horas en lugar de −6. Error de 12 horas.
 *
 * Consecuencia práctica: toda venta hecha después de las 18:00 hora de México
 * se reportaba en el día siguiente. El corte de caja nunca cuadraba, y el
 * dueño veía ventas de ayer contadas como de hoy.
 *
 * El caso de prueba está elegido a propósito en esa franja horaria.
 */

let env: TestEnvironment;

beforeAll(async () => {
  env = await createTestEnvironment("reportes-zona-horaria");
});

afterAll(async () => {
  await env.cleanup();
});

describe("Agrupación diaria en la zona horaria del negocio", () => {
  it("una venta de las 23:30 en México pertenece a ESE día, no al siguiente", async () => {
    const product = await createTestProduct(env, {
      sku: "TZ-001",
      name: "Producto de prueba horaria",
      priceCents: 10000,
      costCents: 6000,
      stockUnits: 100,
    });

    const sale = await createSale(env.ctx, {
      items: [{ productId: product.id, quantity: 1000, discountCents: 0 }],
      payments: [
        { paymentMethodId: env.paymentMethodCashId, amountCents: 10000 },
      ],
      discountCents: 0,
    });

    /*
     * Se fuerza la fecha a un instante conocido y deliberadamente peligroso:
     *
     *   2026-03-10 05:30 UTC  =  2026-03-09 23:30 en Ciudad de México
     *
     * El día UTC (10 de marzo) y el día del negocio (9 de marzo) son
     * DISTINTOS. Con la conversión incorrecta el reporte lo situaba el 10;
     * con la correcta, el 9.
     */
    const instante = new Date("2026-03-10T05:30:00.000Z");
    await db.sale.update({
      where: { id: sale.id },
      data: { createdAt: instante },
    });

    const filas = await salesByPeriod(env.ctx, {
      from: "2026-03-08",
      to: "2026-03-12",
      granularity: "day",
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].period).toBe("2026-03-09");
    expect(filas[0].salesCount).toBe(1);
    expect(filas[0].totalCents).toBe(10000);
  });

  it("una venta de la mañana cae en el mismo día en UTC y en México", async () => {
    // Caso de control: a media mañana ambos calendarios coinciden, así que
    // este test pasaría incluso con la conversión rota. Está para demostrar
    // que la corrección no desplazó las fechas en el sentido contrario.
    const product = await createTestProduct(env, {
      sku: "TZ-002",
      priceCents: 5000,
      stockUnits: 50,
    });

    const sale = await createSale(env.ctx, {
      items: [{ productId: product.id, quantity: 1000, discountCents: 0 }],
      payments: [
        { paymentMethodId: env.paymentMethodCashId, amountCents: 5000 },
      ],
      discountCents: 0,
    });

    // 2026-06-15 17:00 UTC = 2026-06-15 11:00 en México. Mismo día.
    await db.sale.update({
      where: { id: sale.id },
      data: { createdAt: new Date("2026-06-15T17:00:00.000Z") },
    });

    const filas = await salesByPeriod(env.ctx, {
      from: "2026-06-14",
      to: "2026-06-16",
      granularity: "day",
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].period).toBe("2026-06-15");
  });

  it("la utilidad usa el costo congelado en la línea, no el actual", async () => {
    const product = await createTestProduct(env, {
      sku: "TZ-003",
      priceCents: 10000, // con IVA 16% incluido -> base 8621
      costCents: 5000,
      stockUnits: 50,
    });

    const sale = await createSale(env.ctx, {
      items: [{ productId: product.id, quantity: 2000, discountCents: 0 }],
      payments: [
        { paymentMethodId: env.paymentMethodCashId, amountCents: 20000 },
      ],
      discountCents: 0,
    });

    await db.sale.update({
      where: { id: sale.id },
      data: { createdAt: new Date("2026-09-10T18:00:00.000Z") },
    });

    // El proveedor sube el precio DESPUÉS de la venta. El margen histórico no
    // debe cambiar por eso.
    await db.product.update({
      where: { id: product.id },
      data: { costCents: 9000 },
    });

    const filas = await salesByPeriod(env.ctx, {
      from: "2026-09-10",
      to: "2026-09-10",
      granularity: "day",
    });

    // 2 unidades × $50.00 de costo congelado = $100.00
    expect(filas[0].costCents).toBe(10000);
    expect(filas[0].profitCents).toBe(filas[0].subtotalCents - 10000);
  });
});
