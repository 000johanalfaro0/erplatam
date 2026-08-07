import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InsufficientStockError } from "@/server/core/errors";
import { createSale, voidSale } from "@/server/modules/sales";

import {
  type TestEnvironment,
  assertLedgerConsistency,
  createTestEnvironment,
  createTestProduct,
  db,
} from "../helpers/db";

/**
 * PRUEBAS DE CONCURRENCIA E INTEGRIDAD TRANSACCIONAL
 * ===========================================================================
 * Estas pruebas corren contra PostgreSQL real. Es imprescindible: lo que se
 * verifica aquí —bloqueo de filas, aislamiento, atomicidad— es comportamiento
 * del motor. Un mock lo aprobaría siempre sin probar nada.
 *
 * Cubren los requisitos 17 (transacciones y consistencia) y 18 (concurrencia).
 */

let env: TestEnvironment;

beforeAll(async () => {
  env = await createTestEnvironment("ventas-concurrencia");
});

afterAll(async () => {
  await env.cleanup();
});

describe("Venta simultánea del mismo producto", () => {
  it("dos cajas cobrando la ÚLTIMA unidad: solo una lo consigue", async () => {
    // El escenario exacto del requisito 18.
    const product = await createTestProduct(env, {
      sku: "CONC-001",
      name: "Última unidad",
      priceCents: 11600,
      stockUnits: 1,
    });

    // Ambas ventas se lanzan sin esperar entre sí: llegan al servidor a la vez.
    const intentarVenta = () =>
      createSale(env.ctx, {
        items: [
          { productId: product.id, quantity: 1000, discountCents: 0 },
        ],
        payments: [
          { paymentMethodId: env.paymentMethodCashId, amountCents: 11600 },
        ],
        discountCents: 0,
      });

    const resultados = await Promise.allSettled([
      intentarVenta(),
      intentarVenta(),
    ]);

    const exitosas = resultados.filter((r) => r.status === "fulfilled");
    const fallidas = resultados.filter((r) => r.status === "rejected");

    expect(exitosas).toHaveLength(1);
    expect(fallidas).toHaveLength(1);

    // El fallo debe ser por existencia, no un error genérico: la interfaz
    // necesita poder decirle al cajero exactamente qué pasó.
    const motivo = (fallidas[0] as PromiseRejectedResult).reason;
    expect(motivo).toBeInstanceOf(InsufficientStockError);

    // La existencia queda en cero, nunca en negativo.
    const final = await db.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    expect(final.stock).toBe(0);
  });

  it("diez cajas compitiendo por 5 unidades: exactamente 5 ventas", async () => {
    const product = await createTestProduct(env, {
      sku: "CONC-002",
      name: "Cinco unidades",
      priceCents: 5000,
      stockUnits: 5,
    });

    const intentos = Array.from({ length: 10 }, () =>
      createSale(env.ctx, {
        items: [{ productId: product.id, quantity: 1000, discountCents: 0 }],
        payments: [
          { paymentMethodId: env.paymentMethodCashId, amountCents: 5000 },
        ],
        discountCents: 0,
      }),
    );

    const resultados = await Promise.allSettled(intentos);

    const exitosas = resultados.filter((r) => r.status === "fulfilled");
    const fallidas = resultados.filter((r) => r.status === "rejected");

    // Los rechazos SOLO pueden ser por falta de existencia. Cualquier otro
    // motivo (tiempo de espera agotado, pool de conexiones exhausto) sería un
    // fallo de disponibilidad: una venta legítima que el sistema rechazó por
    // sus propias limitaciones, no por el negocio.
    for (const fallo of fallidas) {
      const razon = (fallo as PromiseRejectedResult).reason;
      expect(
        razon,
        `Rechazo inesperado: ${razon?.constructor?.name} — ${razon?.message}`,
      ).toBeInstanceOf(InsufficientStockError);
    }

    expect(exitosas).toHaveLength(5);

    const final = await db.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    expect(final.stock).toBe(0);

    // Cada venta exitosa debe tener un folio ÚNICO. Es lo que verifica que el
    // contador atómico funciona: con `MAX(folio)+1` habría duplicados.
    const folios = exitosas.map(
      (r) => (r as PromiseFulfilledResult<{ folio: string }>).value.folio,
    );
    expect(new Set(folios).size).toBe(5);
  });

  it("ventas concurrentes de productos DISTINTOS no se bloquean entre sí", async () => {
    // Verifica que el bloqueo es por fila y no por tabla: dos cajas vendiendo
    // cosas distintas deben poder trabajar en paralelo.
    const [a, b] = await Promise.all([
      createTestProduct(env, {
        sku: "CONC-003",
        priceCents: 1000,
        stockUnits: 10,
      }),
      createTestProduct(env, {
        sku: "CONC-004",
        priceCents: 1000,
        stockUnits: 10,
      }),
    ]);

    const resultados = await Promise.allSettled([
      createSale(env.ctx, {
        items: [{ productId: a.id, quantity: 3000, discountCents: 0 }],
        payments: [
          { paymentMethodId: env.paymentMethodCashId, amountCents: 3000 },
        ],
        discountCents: 0,
      }),
      createSale(env.ctx, {
        items: [{ productId: b.id, quantity: 4000, discountCents: 0 }],
        payments: [
          { paymentMethodId: env.paymentMethodCashId, amountCents: 4000 },
        ],
        discountCents: 0,
      }),
    ]);

    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("carritos con los mismos productos en ORDEN INVERSO no producen abrazo mortal", async () => {
    // Sin ordenar los bloqueos por id, este es el caso clásico de deadlock:
    // A bloquea X y pide Y, mientras B bloquea Y y pide X.
    const [x, y] = await Promise.all([
      createTestProduct(env, { sku: "DEAD-001", priceCents: 1000, stockUnits: 50 }),
      createTestProduct(env, { sku: "DEAD-002", priceCents: 1000, stockUnits: 50 }),
    ]);

    const carritoAB = createSale(env.ctx, {
      items: [
        { productId: x.id, quantity: 1000, discountCents: 0 },
        { productId: y.id, quantity: 1000, discountCents: 0 },
      ],
      payments: [
        { paymentMethodId: env.paymentMethodCashId, amountCents: 2000 },
      ],
      discountCents: 0,
    });

    const carritoBA = createSale(env.ctx, {
      items: [
        { productId: y.id, quantity: 1000, discountCents: 0 },
        { productId: x.id, quantity: 1000, discountCents: 0 },
      ],
      payments: [
        { paymentMethodId: env.paymentMethodCashId, amountCents: 2000 },
      ],
      discountCents: 0,
    });

    const resultados = await Promise.allSettled([carritoAB, carritoBA]);

    // Ambas deben completarse. Si hubiera abrazo mortal, Postgres abortaría
    // una con SQLSTATE 40P01 — y el reintento automático debería salvarla.
    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
  });
});

describe("Atomicidad: todo o nada", () => {
  it("una venta que falla a mitad NO deja rastro parcial", async () => {
    const disponible = await createTestProduct(env, {
      sku: "ATOM-001",
      priceCents: 1000,
      stockUnits: 100,
    });

    const agotado = await createTestProduct(env, {
      sku: "ATOM-002",
      priceCents: 1000,
      stockUnits: 0,
    });

    const ventasAntes = await db.sale.count({
      where: { businessId: env.businessId },
    });

    // El primer producto tiene existencia; el segundo no. La venta debe fallar
    // ENTERA, sin descontar el primero.
    await expect(
      createSale(env.ctx, {
        items: [
          { productId: disponible.id, quantity: 1000, discountCents: 0 },
          { productId: agotado.id, quantity: 1000, discountCents: 0 },
        ],
        payments: [
          { paymentMethodId: env.paymentMethodCashId, amountCents: 2000 },
        ],
        discountCents: 0,
      }),
    ).rejects.toThrow(InsufficientStockError);

    // El producto disponible conserva TODA su existencia.
    const stockFinal = await db.product.findUniqueOrThrow({
      where: { id: disponible.id },
      select: { stock: true },
    });
    expect(stockFinal.stock).toBe(100_000);

    // No se creó ninguna venta.
    const ventasDespues = await db.sale.count({
      where: { businessId: env.businessId },
    });
    expect(ventasDespues).toBe(ventasAntes);

    // Y no quedó ningún movimiento de inventario huérfano.
    const movimientos = await db.inventoryMovement.count({
      where: { productId: disponible.id, type: "SALE" },
    });
    expect(movimientos).toBe(0);
  });

  it("los pagos deben cuadrar exactamente con el total", async () => {
    const product = await createTestProduct(env, {
      sku: "ATOM-003",
      priceCents: 10000,
      stockUnits: 10,
    });

    // Se paga de menos.
    await expect(
      createSale(env.ctx, {
        items: [{ productId: product.id, quantity: 1000, discountCents: 0 }],
        payments: [
          { paymentMethodId: env.paymentMethodCashId, amountCents: 9000 },
        ],
        discountCents: 0,
      }),
    ).rejects.toThrow(/pagos suman/i);

    // Se paga de más (sin declararlo como efectivo recibido).
    await expect(
      createSale(env.ctx, {
        items: [{ productId: product.id, quantity: 1000, discountCents: 0 }],
        payments: [
          { paymentMethodId: env.paymentMethodCashId, amountCents: 11000 },
        ],
        discountCents: 0,
      }),
    ).rejects.toThrow(/pagos suman/i);
  });
});

describe("Idempotencia", () => {
  it("reenviar la misma clave devuelve la MISMA venta, no una segunda", async () => {
    const product = await createTestProduct(env, {
      sku: "IDEM-001",
      priceCents: 5000,
      stockUnits: 10,
    });

    const idempotencyKey = randomUUID();

    const peticion = () =>
      createSale(env.ctx, {
        items: [{ productId: product.id, quantity: 1000, discountCents: 0 }],
        payments: [
          { paymentMethodId: env.paymentMethodCashId, amountCents: 5000 },
        ],
        discountCents: 0,
        idempotencyKey,
      });

    const primera = await peticion();
    const reintento = await peticion();

    // Es literalmente la misma venta.
    expect(reintento.id).toBe(primera.id);
    expect(reintento.folio).toBe(primera.folio);

    // Y el inventario se descontó UNA sola vez.
    const stockFinal = await db.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    expect(stockFinal.stock).toBe(9000);
  });
});

describe("Cancelación de venta", () => {
  it("devuelve la mercancía al inventario y conserva el documento", async () => {
    const product = await createTestProduct(env, {
      sku: "VOID-001",
      priceCents: 5000,
      stockUnits: 10,
    });

    const venta = await createSale(env.ctx, {
      items: [{ productId: product.id, quantity: 3000, discountCents: 0 }],
      payments: [
        { paymentMethodId: env.paymentMethodCashId, amountCents: 15000 },
      ],
      discountCents: 0,
    });

    const trasVenta = await db.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    expect(trasVenta.stock).toBe(7000);

    const cancelada = await voidSale(env.ctx, venta.id, {
      reason: "El cliente devolvió la mercancía completa",
    });

    expect(cancelada.status).toBe("VOIDED");

    // La existencia vuelve a su valor original.
    const trasCancelar = await db.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    expect(trasCancelar.stock).toBe(10_000);

    // La venta NO se borró: sigue en el histórico con su motivo.
    const enHistorico = await db.sale.findUniqueOrThrow({
      where: { id: venta.id },
      select: { status: true, voidReason: true, voidedAt: true, totalCents: true },
    });
    expect(enHistorico.status).toBe("VOIDED");
    expect(enHistorico.voidReason).toContain("devolvió");
    expect(enHistorico.voidedAt).not.toBeNull();
    // El importe original se conserva intacto: no se pone a cero.
    expect(enHistorico.totalCents).toBe(15000);

    // La reversión dejó su propio asiento en el libro, no borró el original.
    const movimientos = await db.inventoryMovement.findMany({
      where: { saleId: venta.id },
      select: { type: true, quantityDelta: true },
      orderBy: { createdAt: "asc" },
    });
    expect(movimientos).toEqual([
      { type: "SALE", quantityDelta: -3000 },
      { type: "SALE_VOID", quantityDelta: 3000 },
    ]);
  });

  it("no se puede cancelar dos veces", async () => {
    const product = await createTestProduct(env, {
      sku: "VOID-002",
      priceCents: 1000,
      stockUnits: 5,
    });

    const venta = await createSale(env.ctx, {
      items: [{ productId: product.id, quantity: 1000, discountCents: 0 }],
      payments: [
        { paymentMethodId: env.paymentMethodCashId, amountCents: 1000 },
      ],
      discountCents: 0,
    });

    await voidSale(env.ctx, venta.id, { reason: "Primera cancelación" });

    await expect(
      voidSale(env.ctx, venta.id, { reason: "Segunda cancelación" }),
    ).rejects.toThrow(/ya fue cancelada/i);
  });
});

describe("Integridad del libro mayor", () => {
  it("tras todas las operaciones, la caché coincide con la suma de movimientos", async () => {
    // Invariante fundamental del sistema. Se comprueba al final de toda la
    // suite, cuando ya se han ejecutado ventas concurrentes, fallos parciales,
    // idempotencia y cancelaciones.
    const discrepancias = await assertLedgerConsistency(env.businessId);
    expect(discrepancias).toEqual([]);
  });
});
