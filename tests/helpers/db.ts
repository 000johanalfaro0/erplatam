import { randomUUID } from "node:crypto";

import type { RequestContext } from "@/server/core/context";
import { db } from "@/server/core/db";

/**
 * Utilidades para tests de integración contra Postgres REAL.
 *
 * No se usan dobles ni bases en memoria. El motivo es directo: lo que se está
 * probando —bloqueos `FOR UPDATE`, transacciones, abrazos mortales— es
 * comportamiento del motor de base de datos. Un mock lo daría siempre por
 * bueno y no probaría absolutamente nada.
 *
 * Cada suite trabaja sobre su propio negocio, identificado por un UUID. Así
 * los tests no se pisan entre sí ni contaminan los datos de la demo, aunque
 * compartan la misma instancia de Postgres.
 */

export interface TestEnvironment {
  businessId: string;
  ctx: RequestContext;
  taxRate16Id: string;
  taxRate0Id: string;
  paymentMethodCashId: string;
  cleanup: () => Promise<void>;
}

export async function createTestEnvironment(
  label: string,
): Promise<TestEnvironment> {
  const business = await db.business.create({
    data: { name: `[test] ${label} ${randomUUID().slice(0, 8)}` },
  });

  await db.businessSettings.create({
    data: {
      businessId: business.id,
      currency: "MXN",
      locale: "es-MX",
      timezone: "America/Mexico_City",
      defaultTaxRateBps: 1600,
      pricesIncludeTax: true,
      allowNegativeStock: false,
      lowStockThreshold: 5000,
    },
  });

  const role = await db.role.create({
    data: {
      businessId: business.id,
      key: "ADMIN",
      name: "Administrador",
      permissions: ["*"],
      isSystem: true,
    },
  });

  const user = await db.user.create({
    data: {
      businessId: business.id,
      email: `test-${randomUUID().slice(0, 8)}@test.local`,
      name: "Usuario de prueba",
      // Hash irrelevante: los tests invocan los servicios directamente, sin
      // pasar por el inicio de sesión.
      passwordHash: "$2b$10$notarealhashusedfortestingonly000000000000000000000",
      roleId: role.id,
    },
  });

  const [taxRate16, taxRate0] = await Promise.all([
    db.taxRate.create({
      data: {
        businessId: business.id,
        name: "IVA 16%",
        rateBps: 1600,
        isDefault: true,
      },
    }),
    db.taxRate.create({
      data: { businessId: business.id, name: "IVA 0%", rateBps: 0 },
    }),
  ]);

  const cash = await db.paymentMethod.create({
    data: {
      businessId: business.id,
      code: "CASH",
      name: "Efectivo",
      requiresChange: true,
    },
  });

  await db.documentCounter.createMany({
    data: [
      { businessId: business.id, docType: "SALE", prefix: "VTA", nextValue: 1 },
      { businessId: business.id, docType: "PURCHASE", prefix: "CMP", nextValue: 1 },
    ],
  });

  const ctx: RequestContext = {
    userId: user.id,
    userName: user.name,
    businessId: business.id,
    roleKey: "ADMIN",
    permissions: ["*"],
    sessionId: randomUUID(),
    ip: "127.0.0.1",
    userAgent: "vitest",
  };

  return {
    businessId: business.id,
    ctx,
    taxRate16Id: taxRate16.id,
    taxRate0Id: taxRate0.id,
    paymentMethodCashId: cash.id,
    /*
     * Borrado en orden de dependencia.
     *
     * No basta con borrar el negocio y confiar en el cascade: `Payment`
     * referencia a `PaymentMethod` SIN cascade, deliberadamente. Esa
     * restricción existe para que en producción sea imposible borrar un método
     * de pago que ya tiene cobros asociados y dejar tickets históricos con un
     * pago huérfano. Los métodos de pago se retiran con `isActive: false`, no
     * borrándolos.
     *
     * Que el test tenga que ser explícito aquí es la señal de que la
     * restricción está haciendo su trabajo.
     */
    cleanup: async () => {
      await db.payment.deleteMany({ where: { sale: { businessId: business.id } } });
      await db.inventoryMovement.deleteMany({ where: { businessId: business.id } });
      await db.saleItem.deleteMany({ where: { sale: { businessId: business.id } } });
      await db.sale.deleteMany({ where: { businessId: business.id } });
      await db.business.delete({ where: { id: business.id } });
    },
  };
}

/** Crea un producto con existencia inicial y su movimiento correspondiente. */
export async function createTestProduct(
  env: TestEnvironment,
  options: {
    sku: string;
    name?: string;
    priceCents: number;
    costCents?: number;
    /** Unidades enteras; se convierten a mili-unidades. */
    stockUnits: number;
    taxRateId?: string;
    tracksInventory?: boolean;
  },
) {
  const stock = options.stockUnits * 1000;

  return db.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        businessId: env.businessId,
        sku: options.sku,
        name: options.name ?? options.sku,
        priceCents: options.priceCents,
        costCents: options.costCents ?? 0,
        stock,
        taxRateId: options.taxRateId ?? env.taxRate16Id,
        tracksInventory: options.tracksInventory ?? true,
      },
    });

    if (stock !== 0) {
      await tx.inventoryMovement.create({
        data: {
          businessId: env.businessId,
          productId: product.id,
          type: "INITIAL",
          quantityDelta: stock,
          balanceAfter: stock,
          userId: env.ctx.userId,
        },
      });
    }

    return product;
  });
}

/**
 * Comprueba que la caché `Product.stock` coincide con la suma del libro mayor.
 *
 * Es la invariante fundamental del inventario. Se verifica al final de cada
 * test que mueva existencias: si divergen, algo escribió `stock` sin pasar por
 * `applyMovement`, y eso es un fallo grave aunque el test principal pase.
 */
export async function assertLedgerConsistency(businessId: string) {
  const rows = await db.$queryRaw<
    { sku: string; cached: number; ledger: number }[]
  >`
    SELECT
      p.sku,
      p.stock AS cached,
      COALESCE(SUM(m."quantityDelta"), 0)::int AS ledger
    FROM "Product" p
    LEFT JOIN "InventoryMovement" m ON m."productId" = p.id
    WHERE p."businessId" = ${businessId} AND p."tracksInventory" = true
    GROUP BY p.id, p.sku, p.stock
    HAVING p.stock <> COALESCE(SUM(m."quantityDelta"), 0)
  `;

  return rows;
}

export { db };
