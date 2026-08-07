import { z } from "zod";

import { AUDIT_ACTIONS, audit } from "@/server/core/audit";
import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/server/core/errors";
import { logger } from "@/server/core/logger";
import {
  type Page,
  buildPage,
  paginationSchema,
  toSkipTake,
} from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";
import { computeLine, sumDocument } from "@/server/core/pricing";
import { lockProductsForUpdate, nextFolio, transaction } from "@/server/core/tx";
import { applyMovements } from "@/server/modules/inventory";

/**
 * COMPRAS (requisito 7)
 * ===========================================================================
 * Una compra registra mercancía que ENTRA. Comparte la estructura de la venta
 * —transacción, bloqueo de filas, folio atómico, movimientos de inventario,
 * auditoría— pero con dos diferencias importantes:
 *
 *   1. El inventario SUBE, así que nunca hay problema de existencia
 *      insuficiente. No hace falta validar stock.
 *
 *   2. Se actualiza el COSTO del producto. Es el efecto secundario más
 *      valioso: sin esto, el margen que muestra el panel se calcularía con
 *      costos de hace seis meses y sería ficción.
 */

const quantitySchema = z
  .number()
  .int("La cantidad debe ser entera en mili-unidades")
  .min(1, "La cantidad debe ser mayor que cero")
  .max(2_147_483_647);

export const purchaseItemSchema = z.object({
  productId: z.uuid("Producto inválido"),
  quantity: quantitySchema,
  /** Costo unitario en centavos, tal como viene en la factura. */
  unitCostCents: z.number().int().min(0).max(2_147_483_647),
});

export const createPurchaseSchema = z.object({
  items: z
    .array(purchaseItemSchema)
    .min(1, "Agrega al menos un producto a la compra")
    .max(500, "Una compra no puede tener más de 500 líneas"),
  supplierId: z.uuid().optional().nullable(),
  invoiceNumber: z.string().trim().max(50).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  /** Fecha del documento del proveedor. Puede ser retroactiva. */
  purchasedAt: z.iso.datetime().optional(),
  /**
   * Si los costos capturados ya incluyen impuesto. Con proveedores lo normal
   * es que NO, al contrario que en el mostrador.
   */
  costsIncludeTax: z.boolean().default(false),
  idempotencyKey: z.uuid().optional(),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const voidPurchaseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Explica por qué se cancela la compra")
    .max(500),
});

export const listPurchasesSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  supplierId: z.uuid().optional(),
  status: z.enum(["DRAFT", "RECEIVED", "VOIDED"]).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export type ListPurchasesInput = z.infer<typeof listPurchasesSchema>;

const purchaseDetailSelect = {
  id: true,
  folio: true,
  status: true,
  subtotalCents: true,
  taxCents: true,
  totalCents: true,
  invoiceNumber: true,
  notes: true,
  purchasedAt: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  supplier: { select: { id: true, name: true, rfc: true } },
  user: { select: { id: true, name: true } },
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      productSku: true,
      quantity: true,
      unitCostCents: true,
      costIncludesTax: true,
      taxRateBps: true,
      subtotalCents: true,
      taxCents: true,
      totalCents: true,
    },
  },
} as const;

/**
 * Registra una compra y la recibe en inventario.
 *
 * Misma estructura que la venta: lectura fuera de la transacción, escritura
 * dentro con coste constante de consultas.
 */
export async function createPurchase(
  ctx: RequestContext,
  input: CreatePurchaseInput,
) {
  requirePermission(ctx, PERMISSIONS.PURCHASES_WRITE);

  if (input.idempotencyKey) {
    const existing = await db.purchase.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: purchaseDetailSelect,
    });
    if (existing) return existing;
  }

  const settings = await db.businessSettings.findUnique({
    where: { businessId: ctx.businessId },
    select: { defaultTaxRateBps: true },
  });
  if (!settings) throw new NotFoundError("La configuración del negocio");

  // Se consolidan líneas del mismo producto al mismo costo.
  const consolidated = consolidateItems(input.items);
  const productIds = consolidated.map((item) => item.productId);

  const [products, supplier] = await Promise.all([
    db.product.findMany({
      where: {
        id: { in: productIds },
        businessId: ctx.businessId,
        deletedAt: null,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        tracksInventory: true,
        taxRate: { select: { rateBps: true } },
      },
    }),
    input.supplierId
      ? db.supplier.findFirst({
          where: {
            id: input.supplierId,
            businessId: ctx.businessId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (input.supplierId && !supplier) {
    throw new ValidationError("El proveedor seleccionado no existe.");
  }

  const productMap = new Map(products.map((product) => [product.id, product]));

  const lines = consolidated.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new ValidationError(
        "Uno de los productos de la compra ya no existe.",
      );
    }

    const taxRateBps = product.taxRate?.rateBps ?? settings.defaultTaxRateBps;

    return {
      product,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents,
      taxRateBps,
      ...computeLine({
        quantityMilli: item.quantity,
        unitPriceCents: item.unitCostCents,
        taxRateBps,
        priceIncludesTax: input.costsIncludeTax,
      }),
    };
  });

  const totals = sumDocument(lines);

  return transaction(async (tx) => {
    const locked = await lockProductsForUpdate(tx, ctx.businessId, productIds);
    const folio = await nextFolio(tx, ctx.businessId, "PURCHASE");

    const purchase = await tx.purchase.create({
      data: {
        businessId: ctx.businessId,
        folio,
        supplierId: input.supplierId ?? null,
        userId: ctx.userId,
        status: "RECEIVED",
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        invoiceNumber: input.invoiceNumber ?? null,
        notes: input.notes ?? null,
        purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : new Date(),
        idempotencyKey: input.idempotencyKey ?? null,
        items: {
          create: lines.map((line) => ({
            productId: line.product.id,
            productName: line.product.name,
            productSku: line.product.sku,
            quantity: line.quantity,
            unitCostCents: line.unitCostCents,
            costIncludesTax: input.costsIncludeTax,
            taxRateBps: line.taxRateBps,
            subtotalCents: line.subtotalCents,
            taxCents: line.taxCents,
            totalCents: line.totalCents,
          })),
        },
      },
      select: purchaseDetailSelect,
    });

    // Entrada de mercancía, en lote.
    await applyMovements(
      tx,
      ctx,
      lines
        .filter((line) => line.product.tracksInventory)
        .map((line) => ({
          productId: line.product.id,
          currentStock: locked.get(line.product.id)?.stock ?? 0,
          productName: line.product.name,
          type: "PURCHASE" as const,
          quantityDelta: +line.quantity,
          unitCostCents: line.unitCostCents,
          purchaseId: purchase.id,
          reason: `Compra ${folio}`,
        })),
      true, // Una entrada nunca puede dejar el inventario en negativo.
    );

    /*
     * Actualización del costo del producto.
     *
     * Se guarda el ÚLTIMO costo, no un promedio ponderado. Decisión
     * deliberada: el costo promedio es más correcto contablemente, pero exige
     * conocer el valor del inventario existente en cada compra y es difícil de
     * explicar al dueño del negocio. El último costo responde bien a la
     * pregunta práctica —"¿a cómo me sale hoy?"— y el histórico exacto sigue
     * disponible en las líneas de compra si más adelante hace falta calcular
     * el promedio.
     *
     * Se guarda el costo SIN impuesto: es la base con la que se compara el
     * precio de venta para obtener el margen.
     */
    for (const line of lines) {
      const unitCostWithoutTax = Math.round(
        line.subtotalCents / (line.quantity / 1000),
      );
      await tx.product.update({
        where: { id: line.product.id },
        data: { costCents: unitCostWithoutTax },
      });
    }

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.PURCHASE_CREATE,
      entityType: "Purchase",
      entityId: purchase.id,
      after: {
        folio: purchase.folio,
        totalCents: purchase.totalCents,
        lineas: lines.length,
      },
      metadata: {
        folio,
        factura: input.invoiceNumber,
        productos: lines.map((line) => ({
          sku: line.product.sku,
          cantidad: line.quantity,
          costo: line.unitCostCents,
        })),
      },
    });

    logger.info("Compra registrada", {
      folio,
      totalCents: purchase.totalCents,
      lineas: lines.length,
    });

    return purchase;
  });
}

/**
 * Cancela una compra y saca del inventario la mercancía que había entrado.
 *
 * A diferencia de la venta, aquí SÍ puede fallar por existencia: si la
 * mercancía de una compra equivocada ya se vendió, sacarla dejaría el
 * inventario en negativo. En ese caso se rechaza con un mensaje que explica
 * qué hacer.
 */
export async function voidPurchase(
  ctx: RequestContext,
  purchaseId: string,
  input: { reason: string },
) {
  requirePermission(ctx, PERMISSIONS.PURCHASES_VOID);

  const settings = await db.businessSettings.findUnique({
    where: { businessId: ctx.businessId },
    select: { allowNegativeStock: true },
  });

  return transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id: purchaseId, businessId: ctx.businessId },
      select: {
        id: true,
        folio: true,
        status: true,
        totalCents: true,
        items: { select: { productId: true, quantity: true } },
      },
    });

    if (!purchase) throw new NotFoundError("La compra", purchaseId);
    if (purchase.status === "VOIDED") {
      throw new BusinessRuleError("Esta compra ya fue cancelada.");
    }

    const productIds = purchase.items.map((item) => item.productId);
    const locked = await lockProductsForUpdate(tx, ctx.businessId, productIds);

    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, tracksInventory: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Se acumulan por producto: dos líneas del mismo producto en el mismo lote
    // se pisarían al escribir la existencia absoluta.
    const reversals = new Map<
      string,
      { quantity: number; name: string; currentStock: number }
    >();

    for (const item of purchase.items) {
      const product = productMap.get(item.productId);
      const lockedRow = locked.get(item.productId);
      if (!product?.tracksInventory || !lockedRow) continue;

      const existing = reversals.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        reversals.set(item.productId, {
          quantity: item.quantity,
          name: product.name,
          currentStock: lockedRow.stock,
        });
      }
    }

    // Si la mercancía ya se vendió, sacarla dejaría el inventario imposible.
    for (const [, data] of reversals) {
      if (
        data.currentStock < data.quantity &&
        !settings?.allowNegativeStock
      ) {
        throw new BusinessRuleError(
          `No se puede cancelar: de "${data.name}" ya se vendió parte de la mercancía de esta compra. ` +
            `Registra una salida de inventario por la diferencia antes de cancelar.`,
        );
      }
    }

    await applyMovements(
      tx,
      ctx,
      [...reversals.entries()].map(([productId, data]) => ({
        productId,
        currentStock: data.currentStock,
        productName: data.name,
        type: "PURCHASE_VOID" as const,
        quantityDelta: -data.quantity,
        purchaseId: purchase.id,
        reason: `Cancelación de compra ${purchase.folio}: ${input.reason}`,
      })),
      settings?.allowNegativeStock ?? false,
    );

    const voided = await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedByUserId: ctx.userId,
        voidReason: input.reason,
      },
      select: purchaseDetailSelect,
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.PURCHASE_VOID,
      entityType: "Purchase",
      entityId: purchase.id,
      before: { status: "RECEIVED" },
      after: { status: "VOIDED" },
      metadata: {
        folio: purchase.folio,
        totalCents: purchase.totalCents,
        motivo: input.reason,
      },
    });

    return voided;
  });
}

export async function getPurchase(ctx: RequestContext, id: string) {
  requirePermission(ctx, PERMISSIONS.PURCHASES_READ);

  const purchase = await db.purchase.findFirst({
    where: { id, businessId: ctx.businessId },
    select: purchaseDetailSelect,
  });

  if (!purchase) throw new NotFoundError("La compra", id);
  return purchase;
}

export async function listPurchases(
  ctx: RequestContext,
  input: ListPurchasesInput,
): Promise<Page<unknown>> {
  requirePermission(ctx, PERMISSIONS.PURCHASES_READ);

  const where = {
    businessId: ctx.businessId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.supplierId ? { supplierId: input.supplierId } : {}),
    ...(input.search
      ? {
          OR: [
            { folio: { contains: input.search, mode: "insensitive" as const } },
            {
              invoiceNumber: {
                contains: input.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
    ...(input.from || input.to
      ? {
          purchasedAt: {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.purchase.findMany({
      where,
      orderBy: { purchasedAt: "desc" },
      ...toSkipTake(input),
      select: {
        id: true,
        folio: true,
        status: true,
        totalCents: true,
        invoiceNumber: true,
        purchasedAt: true,
        supplier: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.purchase.count({ where }),
  ]);

  return buildPage(items, total, input);
}

function consolidateItems(items: CreatePurchaseInput["items"]) {
  const merged = new Map<string, CreatePurchaseInput["items"][number]>();

  for (const item of items) {
    const key = `${item.productId}:${item.unitCostCents}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(key, { ...item });
    }
  }

  return [...merged.values()];
}
