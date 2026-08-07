import { AUDIT_ACTIONS, audit } from "@/server/core/audit";
import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import {
  BusinessRuleError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from "@/server/core/errors";
import { logger } from "@/server/core/logger";
import { type Page, buildPage, toSkipTake } from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";
import { computeLine, sumDocument } from "@/server/core/pricing";
import {
  type Tx,
  lockProductsForUpdate,
  nextFolio,
  transaction,
} from "@/server/core/tx";
import { applyMovements } from "@/server/modules/inventory";

import type {
  CreateSaleInput,
  ListSalesInput,
  VoidSaleInput,
} from "./schema";

/**
 * VENTAS
 * ===========================================================================
 * El flujo de venta es la operación más crítica del sistema: mueve dinero y
 * mueve inventario a la vez. Todo ocurre en UNA transacción de base de datos
 * (requisito 17):
 *
 *    1. Bloquear las filas de los productos      (FOR UPDATE, en orden de id)
 *    2. Validar existencia real bajo ese bloqueo
 *    3. Calcular importes e impuestos
 *    4. Reservar el folio de forma atómica
 *    5. Crear la venta y sus líneas
 *    6. Registrar los pagos
 *    7. Asentar los movimientos de inventario
 *    8. Actualizar la caché de existencias
 *    9. Escribir la auditoría
 *
 * Si cualquiera de los nueve pasos falla, TODO revierte. Es imposible acabar
 * con "la venta se creó pero el inventario no se actualizó".
 */

const saleDetailSelect = {
  id: true,
  folio: true,
  status: true,
  subtotalCents: true,
  discountCents: true,
  taxCents: true,
  totalCents: true,
  notes: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  customer: { select: { id: true, name: true, rfc: true } },
  user: { select: { id: true, name: true } },
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      productSku: true,
      quantity: true,
      unitPriceCents: true,
      priceIncludesTax: true,
      discountCents: true,
      taxRateBps: true,
      subtotalCents: true,
      taxCents: true,
      totalCents: true,
    },
  },
  payments: {
    select: {
      id: true,
      amountCents: true,
      receivedCents: true,
      changeCents: true,
      reference: true,
      method: { select: { id: true, code: true, name: true } },
    },
  },
} as const;

/**
 * Registra una venta.
 */
export async function createSale(
  ctx: RequestContext,
  input: CreateSaleInput,
) {
  requirePermission(ctx, PERMISSIONS.SALES_CREATE);

  // --- Idempotencia ---------------------------------------------------------
  // Se comprueba ANTES de abrir la transacción. Si la venta ya existe, se
  // devuelve tal cual: el reintento de un cliente que no recibió la respuesta
  // no debe cobrar dos veces.
  if (input.idempotencyKey) {
    const existing = await db.sale.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: saleDetailSelect,
    });

    if (existing) {
      logger.info("Venta idempotente: se devuelve la existente", {
        folio: existing.folio,
        idempotencyKey: input.idempotencyKey,
      });
      return existing;
    }
  }

  const settings = await db.businessSettings.findUnique({
    where: { businessId: ctx.businessId },
    select: {
      pricesIncludeTax: true,
      allowNegativeStock: true,
      defaultTaxRateBps: true,
    },
  });

  if (!settings) throw new NotFoundError("La configuración del negocio");

  // Se consolidan líneas repetidas del mismo producto ANTES de validar
  // existencia. Sin esto, dos líneas de 5 unidades de un producto con 8
  // disponibles pasarían la validación por separado y dejarían el stock en -2.
  const consolidated = consolidateItems(input.items);

  const productIds = consolidated.map((item) => item.productId);

  /*
   * ----------------------------------------------------------------------
   * FASE 1 — FUERA DE LA TRANSACCIÓN
   * ----------------------------------------------------------------------
   * Todo lo que es solo lectura de datos de referencia se resuelve ANTES de
   * abrir la transacción: catálogo, impuestos, métodos de pago, cliente, y el
   * cálculo completo de importes.
   *
   * Motivo, medido y no teórico: cada consulta dentro de la transacción se
   * ejecuta con los bloqueos de fila ya retenidos, y paga la latencia de red
   * completa. Cuantas más consultas haya dentro, más tiempo permanecen
   * bloqueados los productos y menos cajas simultáneas soporta el sistema.
   * Una prueba de concurrencia con diez cajas sobre el mismo producto agotaba
   * el tiempo de la transacción justamente por esto.
   *
   * Es seguro sacar estos datos fuera porque son estables durante la
   * operación: un precio o una tasa que cambiaran en este instante deben
   * aplicarse igualmente con el valor que el cajero tenía a la vista.
   *
   * Lo ÚNICO que no puede salir es la existencia, que debe leerse bajo
   * bloqueo. Ese es el dato que dos cajas se disputan.
   */
  const [products, paymentMethodCount, customer] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds }, businessId: ctx.businessId, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        priceCents: true,
        costCents: true,
        status: true,
        tracksInventory: true,
        taxRate: { select: { rateBps: true } },
      },
    }),
    db.paymentMethod.count({
      where: {
        id: { in: [...new Set(input.payments.map((p) => p.paymentMethodId))] },
        businessId: ctx.businessId,
        isActive: true,
      },
    }),
    input.customerId
      ? db.customer.findFirst({
          where: {
            id: input.customerId,
            businessId: ctx.businessId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const uniquePaymentMethods = new Set(
    input.payments.map((p) => p.paymentMethodId),
  ).size;

  if (paymentMethodCount !== uniquePaymentMethods) {
    throw new ValidationError(
      "Uno de los métodos de pago no existe o está desactivado.",
    );
  }

  if (input.customerId && !customer) {
    throw new ValidationError("El cliente seleccionado no existe.");
  }

  const productMap = new Map(products.map((product) => [product.id, product]));

  // Cálculo de importes e impuestos. Función pura, sin base de datos.
  const draftLines = consolidated.map((item) => {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new ValidationError(
        "Uno de los productos de la venta ya no existe. Actualiza el carrito.",
      );
    }

    if (product.status !== "ACTIVE") {
      throw new BusinessRuleError(
        `"${product.name}" está desactivado y no puede venderse.`,
      );
    }

    const unitPriceCents = item.unitPriceCents ?? product.priceCents;
    const taxRateBps = product.taxRate?.rateBps ?? settings.defaultTaxRateBps;

    return {
      product,
      quantity: item.quantity,
      unitPriceCents,
      discountCents: item.discountCents,
      taxRateBps,
      ...computeLine({
        quantityMilli: item.quantity,
        unitPriceCents,
        discountCents: item.discountCents,
        taxRateBps,
        priceIncludesTax: settings.pricesIncludeTax,
      }),
    };
  });

  const totals = sumDocument(draftLines, input.discountCents);

  // Los pagos deben cubrir exactamente el total. Ni de más ni de menos: un
  // descuadre aquí es dinero que no cuadra en el corte de caja.
  const paidCents = input.payments.reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  );

  if (paidCents !== totals.totalCents) {
    throw new ValidationError(
      `Los pagos suman ${formatCents(paidCents)} pero el total es ${formatCents(totals.totalCents)}.`,
      { paidCents, totalCents: totals.totalCents },
    );
  }

  /*
   * ----------------------------------------------------------------------
   * FASE 2 — DENTRO DE LA TRANSACCIÓN
   * ----------------------------------------------------------------------
   * Coste constante: 6 consultas, tanto para un ticket de 1 línea como de 200.
   *
   *   1. Bloquear filas de producto (FOR UPDATE, en orden de id)
   *   2. Reservar folio
   *   3. Crear venta con líneas y pagos anidados
   *   4. Asentar todos los movimientos de inventario  (lote)
   *   5. Actualizar todas las existencias             (lote)
   *   6. Escribir auditoría
   */
  return transaction(async (tx) => {
    // --- 1. Bloqueo pesimista ---------------------------------------------
    // A partir de aquí, ninguna otra transacción puede leer ni modificar la
    // existencia de estos productos hasta que esta confirme o revierta.
    const locked = await lockProductsForUpdate(tx, ctx.businessId, productIds);

    // Validación de existencia con el valor leído BAJO BLOQUEO. Es la única
    // comprobación que debe ocurrir aquí dentro.
    const lines = draftLines.map((line) => {
      const lockedRow = locked.get(line.product.id);

      if (line.product.tracksInventory && lockedRow) {
        if (
          lockedRow.stock < line.quantity &&
          !settings.allowNegativeStock
        ) {
          throw new InsufficientStockError(
            line.product.name,
            lockedRow.stock,
            line.quantity,
          );
        }
      }

      return { ...line, currentStock: lockedRow?.stock ?? 0 };
    });

    // --- 2. Folio atómico --------------------------------------------------
    const folio = await nextFolio(tx, ctx.businessId, "SALE");

    // --- 3. Documento de venta con líneas y pagos anidados ----------------
    const sale = await tx.sale.create({
      data: {
        businessId: ctx.businessId,
        folio,
        customerId: input.customerId ?? null,
        userId: ctx.userId,
        status: "COMPLETED",
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey ?? null,

        items: {
          create: lines.map((line) => ({
            productId: line.product.id,
            // Nombre y SKU se COPIAN, no se referencian: si el producto se
            // renombra mañana, el ticket de hoy sigue diciendo lo que se
            // vendió realmente.
            productName: line.product.name,
            productSku: line.product.sku,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            priceIncludesTax: settings.pricesIncludeTax,
            unitCostCents: line.product.costCents,
            discountCents: line.discountCents,
            taxRateBps: line.taxRateBps,
            subtotalCents: line.subtotalCents,
            taxCents: line.taxCents,
            totalCents: line.totalCents,
          })),
        },

        payments: {
          create: input.payments.map((payment) => ({
            paymentMethodId: payment.paymentMethodId,
            amountCents: payment.amountCents,
            receivedCents: payment.receivedCents ?? null,
            changeCents:
              payment.receivedCents !== undefined
                ? Math.max(0, payment.receivedCents - payment.amountCents)
                : null,
            reference: payment.reference ?? null,
          })),
        },
      },
      select: saleDetailSelect,
    });

    // --- 4 y 5. Movimientos de inventario y existencias, en lote ----------
    // Dos consultas en total, sea cual sea el número de líneas del ticket.
    await applyMovements(
      tx,
      ctx,
      lines
        .filter((line) => line.product.tracksInventory)
        .map((line) => ({
          productId: line.product.id,
          currentStock: line.currentStock,
          productName: line.product.name,
          type: "SALE" as const,
          quantityDelta: -line.quantity,
          unitCostCents: line.product.costCents,
          saleId: sale.id,
          reason: `Venta ${folio}`,
        })),
      settings.allowNegativeStock,
    );

    // --- 6. Auditoría (dentro de la misma transacción) ---------------------
    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.SALE_CREATE,
      entityType: "Sale",
      entityId: sale.id,
      after: {
        folio: sale.folio,
        totalCents: sale.totalCents,
        subtotalCents: sale.subtotalCents,
        taxCents: sale.taxCents,
        lineas: lines.length,
      },
      metadata: {
        folio,
        productos: lines.map((line) => ({
          sku: line.product.sku,
          cantidad: line.quantity,
          importe: line.totalCents,
        })),
      },
    });

    logger.info("Venta registrada", {
      folio,
      totalCents: sale.totalCents,
      lineas: lines.length,
      userId: ctx.userId,
    });

    return sale;
  });
}

/**
 * Cancela una venta.
 *
 * Reglas (requisito 14):
 *   - La venta NO se borra ni se edita. Se marca VOIDED con motivo y autor.
 *   - El inventario se REVIERTE con movimientos de tipo SALE_VOID, que dejan
 *     su propio rastro. No se "deshace" el movimiento original: el libro es
 *     append-only, así que se compensa con un asiento contrario.
 *   - Cancelar dos veces no hace nada: la segunda vez falla explícitamente.
 */
export async function voidSale(
  ctx: RequestContext,
  saleId: string,
  input: VoidSaleInput,
) {
  requirePermission(ctx, PERMISSIONS.SALES_VOID);

  return transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, businessId: ctx.businessId },
      select: {
        id: true,
        folio: true,
        status: true,
        totalCents: true,
        createdAt: true,
        items: {
          select: {
            productId: true,
            productName: true,
            quantity: true,
          },
        },
      },
    });

    if (!sale) throw new NotFoundError("La venta", saleId);

    if (sale.status === "VOIDED") {
      throw new BusinessRuleError("Esta venta ya fue cancelada.");
    }

    const productIds = sale.items.map((item) => item.productId);
    const locked = await lockProductsForUpdate(tx, ctx.businessId, productIds);

    const trackedProducts = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, tracksInventory: true, costCents: true },
    });
    const productMap = new Map(trackedProducts.map((p) => [p.id, p]));

    // Devolución de la mercancía al inventario, en lote.
    //
    // Si la venta incluía varias líneas del mismo producto, se acumulan: dos
    // asientos sobre la misma fila en el mismo lote se pisarían al escribir la
    // existencia absoluta.
    const reversals = new Map<
      string,
      { quantity: number; name: string; costCents: number; currentStock: number }
    >();

    for (const item of sale.items) {
      const product = productMap.get(item.productId);
      const lockedRow = locked.get(item.productId);

      // Un producto eliminado o que dejó de controlar inventario no recibe
      // movimiento; la cancelación sigue siendo válida igualmente.
      if (!product?.tracksInventory || !lockedRow) continue;

      const existing = reversals.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        reversals.set(item.productId, {
          quantity: item.quantity,
          name: product.name,
          costCents: product.costCents,
          currentStock: lockedRow.stock,
        });
      }
    }

    await applyMovements(
      tx,
      ctx,
      [...reversals.entries()].map(([productId, data]) => ({
        productId,
        currentStock: data.currentStock,
        productName: data.name,
        type: "SALE_VOID" as const,
        quantityDelta: +data.quantity,
        unitCostCents: data.costCents,
        saleId: sale.id,
        reason: `Cancelación de venta ${sale.folio}: ${input.reason}`,
      })),
      // Devolver mercancía siempre incrementa: no puede violar el mínimo.
      true,
    );

    const voided = await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedByUserId: ctx.userId,
        voidReason: input.reason,
      },
      select: saleDetailSelect,
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.SALE_VOID,
      entityType: "Sale",
      entityId: sale.id,
      before: { status: "COMPLETED" },
      after: { status: "VOIDED" },
      metadata: {
        folio: sale.folio,
        totalCents: sale.totalCents,
        motivo: input.reason,
        ventaOriginal: sale.createdAt,
        piezasDevueltas: sale.items.length,
      },
    });

    logger.info("Venta cancelada", {
      folio: sale.folio,
      motivo: input.reason,
      userId: ctx.userId,
    });

    return voided;
  });
}

export async function getSale(ctx: RequestContext, id: string) {
  requirePermission(ctx, PERMISSIONS.SALES_READ);

  const sale = await db.sale.findFirst({
    where: { id, businessId: ctx.businessId },
    select: saleDetailSelect,
  });

  if (!sale) throw new NotFoundError("La venta", id);
  return sale;
}

export async function listSales(
  ctx: RequestContext,
  input: ListSalesInput,
): Promise<Page<unknown>> {
  requirePermission(ctx, PERMISSIONS.SALES_READ);

  const where = {
    businessId: ctx.businessId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.search
      ? { folio: { contains: input.search.trim(), mode: "insensitive" as const } }
      : {}),
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
    db.sale.findMany({
      where,
      orderBy: { [input.sortBy]: input.sortDir },
      ...toSkipTake(input),
      select: {
        id: true,
        folio: true,
        status: true,
        subtotalCents: true,
        taxCents: true,
        totalCents: true,
        createdAt: true,
        customer: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { items: true } },
        payments: { select: { method: { select: { code: true, name: true } } } },
      },
    }),
    db.sale.count({ where }),
  ]);

  return buildPage(items, total, input);
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

/**
 * Une líneas del mismo producto en una sola.
 *
 * Necesario para que la validación de existencia sea correcta: si el carrito
 * trae el mismo producto en dos renglones, hay que validar la suma, no cada
 * renglón por separado.
 */
function consolidateItems(items: CreateSaleInput["items"]) {
  const merged = new Map<string, CreateSaleInput["items"][number]>();

  for (const item of items) {
    // Un precio unitario distinto significa una línea distinta de verdad
    // (p. ej. 2 al precio normal y 1 con descuento especial).
    const key = `${item.productId}:${item.unitPriceCents ?? "catalogo"}`;
    const existing = merged.get(key);

    if (existing) {
      existing.quantity += item.quantity;
      existing.discountCents += item.discountCents;
    } else {
      merged.set(key, { ...item });
    }
  }

  return [...merged.values()];
}

async function assertPaymentMethodsExist(
  tx: Tx,
  businessId: string,
  payments: CreateSaleInput["payments"],
) {
  const ids = [...new Set(payments.map((p) => p.paymentMethodId))];

  const found = await tx.paymentMethod.count({
    where: { id: { in: ids }, businessId, isActive: true },
  });

  if (found !== ids.length) {
    throw new ValidationError(
      "Uno de los métodos de pago no existe o está desactivado.",
    );
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
