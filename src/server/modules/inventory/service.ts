import { Prisma } from "@/generated/prisma/client";
import type { MovementType } from "@/generated/prisma/enums";
import { AUDIT_ACTIONS, audit } from "@/server/core/audit";
import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import {
  BusinessRuleError,
  InsufficientStockError,
  NotFoundError,
} from "@/server/core/errors";
import { type Page, buildPage, toSkipTake } from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";
import { type Tx, lockProductsForUpdate, transaction } from "@/server/core/tx";

import type {
  ListMovementsInput,
  StockAdjustmentInput,
  StockMovementInput,
} from "./schema";

/**
 * INVENTARIO — LIBRO MAYOR
 * ===========================================================================
 * Principio central (requisito 6): la existencia de un producto NO se edita.
 * Se derivan de movimientos.
 *
 *   Product.stock  = caché denormalizada, para consultar rápido
 *   InventoryMovement = libro append-only, la VERDAD
 *
 * Toda mutación de existencias del sistema —venta, compra, ajuste, entrada,
 * salida, cancelación— pasa por `applyMovement`. No hay ninguna otra ruta.
 * Esa exclusividad es lo que garantiza que el historial sea completo y que se
 * pueda reconstruir la existencia a cualquier fecha pasada.
 */

/**
 * Aplica un movimiento de inventario dentro de una transacción existente.
 *
 * FUNCIÓN CRÍTICA DEL SISTEMA. Requisitos de uso:
 *
 *   - Las filas de producto DEBEN estar ya bloqueadas con
 *     `lockProductsForUpdate` antes de llamar aquí. Sin ese bloqueo, dos cajas
 *     concurrentes pueden leer la misma existencia y venderla dos veces.
 *   - Se ejecuta siempre dentro de una transacción, para que el movimiento y
 *     la actualización de la caché confirmen o reviertan juntos.
 *
 * @param quantityDelta Cambio con signo. Negativo = salida.
 */
export async function applyMovement(
  tx: Tx,
  ctx: RequestContext,
  params: {
    productId: string;
    /** Existencia actual, LEÍDA BAJO BLOQUEO. */
    currentStock: number;
    productName: string;
    type: MovementType;
    quantityDelta: number;
    unitCostCents?: number | null;
    reason?: string | null;
    saleId?: string | null;
    purchaseId?: string | null;
    /** Permite existencia negativa. Solo si el negocio lo habilitó. */
    allowNegative: boolean;
  },
): Promise<{ balanceAfter: number }> {
  const balanceAfter = params.currentStock + params.quantityDelta;

  if (balanceAfter < 0 && !params.allowNegative) {
    throw new InsufficientStockError(
      params.productName,
      params.currentStock,
      Math.abs(params.quantityDelta),
    );
  }

  // 1. Se asienta el movimiento en el libro (append-only, nunca se edita).
  await tx.inventoryMovement.create({
    data: {
      businessId: ctx.businessId,
      productId: params.productId,
      type: params.type,
      quantityDelta: params.quantityDelta,
      balanceAfter,
      unitCostCents: params.unitCostCents ?? null,
      reason: params.reason ?? null,
      saleId: params.saleId ?? null,
      purchaseId: params.purchaseId ?? null,
      userId: ctx.userId,
    },
  });

  // 2. Se actualiza la caché de existencia.
  //
  // Se escribe el valor absoluto ya calculado, no `{ increment }`. Es seguro
  // porque la fila está bloqueada: `currentStock` no puede haber cambiado
  // entre la lectura y esta escritura. Y hace que el valor guardado coincida
  // exactamente con el `balanceAfter` del movimiento, lo que permite detectar
  // cualquier divergencia comparando ambas columnas.
  await tx.product.update({
    where: { id: params.productId },
    data: { stock: balanceAfter },
  });

  return { balanceAfter };
}

export interface MovementSpec {
  productId: string;
  /** Existencia actual, LEÍDA BAJO BLOQUEO. */
  currentStock: number;
  productName: string;
  type: MovementType;
  quantityDelta: number;
  unitCostCents?: number | null;
  reason?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
}

/**
 * Aplica VARIOS movimientos en dos consultas, independientemente de cuántos
 * productos haya.
 *
 * POR QUÉ EXISTE (y por qué importa de verdad)
 * ---------------------------------------------------------------------------
 * `applyMovement` hace 2 consultas por producto. Dentro de una transacción que
 * mantiene bloqueos, esas consultas se serializan y cada una paga la latencia
 * de red completa. Con una base de datos gestionada (~100 ms por viaje) y un
 * ticket de 10 líneas, eso son 20 viajes ≈ 2 segundos con los bloqueos
 * retenidos — y mientras tanto ninguna otra caja puede vender esos productos.
 *
 * Esto se detectó con una prueba de concurrencia real: diez cajas compitiendo
 * por el mismo producto agotaban el tiempo de la transacción. El síntoma era
 * una venta legítima rechazada, que es un fallo de disponibilidad.
 *
 * Con el lote, el coste dentro de la transacción es constante: 2 consultas,
 * haya 1 línea o 200. Los bloqueos se sueltan mucho antes y el sistema aguanta
 * bastante más concurrencia.
 */
export async function applyMovements(
  tx: Tx,
  ctx: RequestContext,
  specs: readonly MovementSpec[],
  allowNegative: boolean,
): Promise<Map<string, number>> {
  if (specs.length === 0) return new Map();

  // 1. Validación previa: se comprueba TODO antes de escribir nada, para que
  //    un fallo en la última línea no deje las anteriores aplicadas.
  const balances = new Map<string, number>();

  for (const spec of specs) {
    const balanceAfter = spec.currentStock + spec.quantityDelta;

    if (balanceAfter < 0 && !allowNegative) {
      throw new InsufficientStockError(
        spec.productName,
        spec.currentStock,
        Math.abs(spec.quantityDelta),
      );
    }

    balances.set(spec.productId, balanceAfter);
  }

  // 2. Todos los asientos del libro, en una sola consulta.
  await tx.inventoryMovement.createMany({
    data: specs.map((spec) => ({
      businessId: ctx.businessId,
      productId: spec.productId,
      type: spec.type,
      quantityDelta: spec.quantityDelta,
      balanceAfter: balances.get(spec.productId)!,
      unitCostCents: spec.unitCostCents ?? null,
      reason: spec.reason ?? null,
      saleId: spec.saleId ?? null,
      purchaseId: spec.purchaseId ?? null,
      userId: ctx.userId,
    })),
  });

  // 3. Todas las existencias, en una sola consulta.
  //
  //    Se escribe el valor absoluto ya calculado (no `stock + delta`), lo cual
  //    es seguro porque las filas están bloqueadas: nadie pudo cambiarlas
  //    entre la lectura y esta escritura. Además garantiza que `Product.stock`
  //    coincida exactamente con el `balanceAfter` del último movimiento.
  const values = Prisma.join(
    specs.map(
      (spec) =>
        Prisma.sql`(${spec.productId}::text, ${balances.get(spec.productId)!}::int)`,
    ),
  );

  await tx.$executeRaw`
    UPDATE "Product" AS p
    SET stock = v.stock
    FROM (VALUES ${values}) AS v(id, stock)
    WHERE p.id = v.id
  `;

  return balances;
}

/** Configuración relevante para inventario. */
async function getInventorySettings(businessId: string) {
  const settings = await db.businessSettings.findUnique({
    where: { businessId },
    select: { allowNegativeStock: true, lowStockThreshold: true },
  });

  if (!settings) throw new NotFoundError("La configuración del negocio");
  return settings;
}

/**
 * Entrada manual de mercancía (sin documento de compra).
 *
 * Casos reales: devolución de un cliente que vuelve a inventario, hallazgo en
 * un conteo, traspaso desde otra sucursal.
 */
export async function registerEntry(
  ctx: RequestContext,
  input: StockMovementInput,
) {
  requirePermission(ctx, PERMISSIONS.INVENTORY_ADJUST);
  return applyManualMovement(ctx, input, "ENTRY", +1);
}

/**
 * Salida manual de mercancía.
 *
 * Casos reales: merma, caducidad, rotura, consumo interno.
 */
export async function registerExit(
  ctx: RequestContext,
  input: StockMovementInput,
) {
  requirePermission(ctx, PERMISSIONS.INVENTORY_ADJUST);
  return applyManualMovement(ctx, input, "EXIT", -1);
}

async function applyManualMovement(
  ctx: RequestContext,
  input: StockMovementInput,
  type: MovementType,
  sign: 1 | -1,
) {
  const settings = await getInventorySettings(ctx.businessId);

  return transaction(async (tx) => {
    const locked = await lockProductsForUpdate(tx, ctx.businessId, [
      input.productId,
    ]);
    const product = locked.get(input.productId);

    if (!product) throw new NotFoundError("El producto", input.productId);

    if (!product.tracksInventory) {
      throw new BusinessRuleError(
        `"${product.name}" no controla inventario, así que no admite movimientos de existencia.`,
      );
    }

    const quantityDelta = sign * input.quantity;

    const { balanceAfter } = await applyMovement(tx, ctx, {
      productId: product.id,
      currentStock: product.stock,
      productName: product.name,
      type,
      quantityDelta,
      unitCostCents: input.unitCostCents ?? null,
      reason: input.reason,
      allowNegative: settings.allowNegativeStock,
    });

    await audit(tx, ctx, {
      action:
        type === "ENTRY"
          ? AUDIT_ACTIONS.INVENTORY_ENTRY
          : AUDIT_ACTIONS.INVENTORY_EXIT,
      entityType: "Product",
      entityId: product.id,
      before: { stock: product.stock },
      after: { stock: balanceAfter },
      metadata: {
        producto: product.name,
        tipo: type,
        cantidad: input.quantity,
        motivo: input.reason,
      },
    });

    return {
      productId: product.id,
      productName: product.name,
      previousStock: product.stock,
      newStock: balanceAfter,
      quantityDelta,
    };
  });
}

/**
 * Ajuste por conteo físico.
 *
 * El usuario informa cuánto hay REALMENTE; el sistema calcula la diferencia y
 * la asienta como un único movimiento de tipo ADJUSTMENT.
 *
 * Un ajuste con diferencia cero no genera movimiento pero SÍ se audita: saber
 * que se contó y cuadró es información valiosa.
 */
export async function adjustStock(
  ctx: RequestContext,
  input: StockAdjustmentInput,
) {
  requirePermission(ctx, PERMISSIONS.INVENTORY_ADJUST);

  const settings = await getInventorySettings(ctx.businessId);

  return transaction(async (tx) => {
    const locked = await lockProductsForUpdate(tx, ctx.businessId, [
      input.productId,
    ]);
    const product = locked.get(input.productId);

    if (!product) throw new NotFoundError("El producto", input.productId);

    if (!product.tracksInventory) {
      throw new BusinessRuleError(
        `"${product.name}" no controla inventario, así que no admite ajustes.`,
      );
    }

    const quantityDelta = input.countedQuantity - product.stock;

    if (quantityDelta === 0) {
      await audit(tx, ctx, {
        action: AUDIT_ACTIONS.INVENTORY_ADJUST,
        entityType: "Product",
        entityId: product.id,
        metadata: {
          producto: product.name,
          resultado: "sin_diferencia",
          contado: input.countedQuantity,
          motivo: input.reason,
        },
      });

      return {
        productId: product.id,
        productName: product.name,
        previousStock: product.stock,
        newStock: product.stock,
        quantityDelta: 0,
      };
    }

    const { balanceAfter } = await applyMovement(tx, ctx, {
      productId: product.id,
      currentStock: product.stock,
      productName: product.name,
      type: "ADJUSTMENT",
      quantityDelta,
      reason: input.reason,
      // Un ajuste refleja la realidad física contada: si el conteo dice que
      // hay 3, hay 3, aunque el sistema creyera que había 10. Bloquearlo por
      // política de negativos impediría corregir el error.
      allowNegative: settings.allowNegativeStock || input.countedQuantity >= 0,
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.INVENTORY_ADJUST,
      entityType: "Product",
      entityId: product.id,
      before: { stock: product.stock },
      after: { stock: balanceAfter },
      metadata: {
        producto: product.name,
        sistema: product.stock,
        contado: input.countedQuantity,
        diferencia: quantityDelta,
        motivo: input.reason,
      },
    });

    return {
      productId: product.id,
      productName: product.name,
      previousStock: product.stock,
      newStock: balanceAfter,
      quantityDelta,
    };
  });
}

/**
 * Kardex: historial de movimientos.
 *
 * Es la pantalla que responde "¿por qué este producto tiene esta existencia?".
 * Cada fila enlaza con su documento origen (venta o compra) cuando lo tiene.
 */
export async function listMovements(
  ctx: RequestContext,
  input: ListMovementsInput,
): Promise<Page<unknown>> {
  requirePermission(ctx, PERMISSIONS.INVENTORY_READ);

  const where = {
    businessId: ctx.businessId,
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(input),
      select: {
        id: true,
        type: true,
        quantityDelta: true,
        balanceAfter: true,
        unitCostCents: true,
        reason: true,
        createdAt: true,
        product: { select: { id: true, name: true, sku: true, unit: true } },
        user: { select: { id: true, name: true } },
        sale: { select: { id: true, folio: true } },
        purchase: { select: { id: true, folio: true } },
      },
    }),
    db.inventoryMovement.count({ where }),
  ]);

  return buildPage(items, total, input);
}

/**
 * Verificación de integridad del inventario.
 *
 * Recalcula la existencia sumando TODOS los movimientos de cada producto y la
 * compara con la caché `Product.stock`. Si divergen, hay un error grave —
 * alguien escribió `stock` sin pasar por `applyMovement`.
 *
 * Se usa en los tests de integración y está disponible como comprobación
 * operativa durante la demo. Es la prueba de que el libro mayor y la caché
 * cuentan la misma historia.
 */
export async function verifyIntegrity(ctx: RequestContext) {
  requirePermission(ctx, PERMISSIONS.INVENTORY_READ);

  const rows = await db.$queryRaw<
    {
      id: string;
      sku: string;
      name: string;
      cachedStock: number;
      ledgerStock: number;
    }[]
  >`
    SELECT
      p.id,
      p.sku,
      p.name,
      p.stock AS "cachedStock",
      COALESCE(SUM(m."quantityDelta"), 0)::int AS "ledgerStock"
    FROM "Product" p
    LEFT JOIN "InventoryMovement" m ON m."productId" = p.id
    WHERE p."businessId" = ${ctx.businessId}
      AND p."deletedAt" IS NULL
      AND p."tracksInventory" = true
    GROUP BY p.id, p.sku, p.name, p.stock
    HAVING p.stock <> COALESCE(SUM(m."quantityDelta"), 0)
  `;

  return {
    consistent: rows.length === 0,
    discrepancies: rows,
  };
}
