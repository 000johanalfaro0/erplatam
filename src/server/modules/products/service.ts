import { AUDIT_ACTIONS, audit } from "@/server/core/audit";
import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/core/errors";
import { type Page, buildPage } from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";
import { transaction } from "@/server/core/tx";

import * as repo from "./repository";
import type {
  CreateProductInput,
  ListProductsInput,
  UpdateProductInput,
} from "./schema";

/**
 * Reglas de negocio de productos.
 *
 * Todo método público:
 *   1. Verifica permisos (aquí, no en la ruta HTTP).
 *   2. Valida invariantes de negocio.
 *   3. Ejecuta en transacción si toca más de una tabla.
 *   4. Registra auditoría dentro de esa misma transacción.
 */

/** Configuración del negocio que necesitan varias operaciones. */
async function getSettings(businessId: string) {
  const settings = await db.businessSettings.findUnique({
    where: { businessId },
    select: {
      lowStockThreshold: true,
      defaultTaxRateBps: true,
      pricesIncludeTax: true,
    },
  });

  if (!settings) {
    throw new NotFoundError("La configuración del negocio");
  }

  return settings;
}

export async function list(
  ctx: RequestContext,
  input: ListProductsInput,
): Promise<Page<repo.ProductListItem>> {
  requirePermission(ctx, PERMISSIONS.PRODUCTS_READ);

  const settings = await getSettings(ctx.businessId);
  const { items, total } = await repo.listProducts(
    ctx.businessId,
    input,
    settings.lowStockThreshold,
  );

  return buildPage(items, total, input);
}

export async function getById(ctx: RequestContext, id: string) {
  requirePermission(ctx, PERMISSIONS.PRODUCTS_READ);

  const product = await repo.findProductById(ctx.businessId, id);
  if (!product) throw new NotFoundError("El producto", id);

  return product;
}

/** Búsqueda exacta por SKU o código de barras. La usa el punto de venta. */
export async function getByCode(ctx: RequestContext, code: string) {
  requirePermission(ctx, PERMISSIONS.PRODUCTS_READ);

  const product = await repo.findProductByCode(ctx.businessId, code.trim());
  if (!product) throw new NotFoundError("El producto con ese código");

  return product;
}

/**
 * Crea un producto.
 *
 * Si se indica existencia inicial, el producto y su movimiento de inventario
 * se crean en la MISMA transacción. Nunca puede quedar un producto con
 * existencia sin el movimiento que la justifica: esa es la invariante que hace
 * auditable el inventario (requisito 6).
 */
export async function create(ctx: RequestContext, input: CreateProductInput) {
  requirePermission(ctx, PERMISSIONS.PRODUCTS_WRITE);

  // El costo no puede superar al precio sin que sea un aviso, pero SÍ se
  // permite: hay productos gancho que se venden a pérdida deliberadamente.
  // No se bloquea; se registra en la auditoría para que sea visible.

  return transaction(async (tx) => {
    if (await repo.skuExists(tx, ctx.businessId, input.sku)) {
      throw new ConflictError(
        `Ya existe un producto con el SKU "${input.sku}".`,
      );
    }

    if (
      input.barcode &&
      (await repo.barcodeExists(tx, ctx.businessId, input.barcode))
    ) {
      throw new ConflictError(
        `El código de barras "${input.barcode}" ya está asignado a otro producto.`,
      );
    }

    await assertReferencesBelongToBusiness(tx, ctx.businessId, input);

    const initialStock = input.tracksInventory ? input.initialStock : 0;

    const product = await repo.createProduct(tx, {
      businessId: ctx.businessId,
      sku: input.sku,
      name: input.name,
      description: input.description ?? null,
      barcode: input.barcode ?? null,
      categoryId: input.categoryId ?? null,
      supplierId: input.supplierId ?? null,
      taxRateId: input.taxRateId ?? null,
      priceCents: input.priceCents,
      costCents: input.costCents,
      unit: input.unit,
      stock: initialStock,
      minStock: input.minStock ?? null,
      tracksInventory: input.tracksInventory,
      status: input.status,
      satProductCode: input.satProductCode ?? null,
      satUnitCode: input.satUnitCode ?? null,
    });

    if (initialStock > 0) {
      await tx.inventoryMovement.create({
        data: {
          businessId: ctx.businessId,
          productId: product.id,
          type: "INITIAL",
          quantityDelta: initialStock,
          balanceAfter: initialStock,
          unitCostCents: input.costCents,
          reason: "Existencia inicial al dar de alta el producto",
          userId: ctx.userId,
        },
      });
    }

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.PRODUCT_CREATE,
      entityType: "Product",
      entityId: product.id,
      after: {
        sku: product.sku,
        name: product.name,
        priceCents: product.priceCents,
        costCents: product.costCents,
        stock: product.stock,
      },
      metadata: { initialStock },
    });

    return product;
  });
}

/**
 * Actualiza un producto.
 *
 * `stock` es intocable por esta vía: cambiar existencias exige el módulo de
 * inventario, que registra el movimiento y el motivo.
 */
export async function update(
  ctx: RequestContext,
  id: string,
  input: UpdateProductInput,
) {
  requirePermission(ctx, PERMISSIONS.PRODUCTS_WRITE);

  return transaction(async (tx) => {
    const current = await tx.product.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
    });

    if (!current) throw new NotFoundError("El producto", id);

    if (input.sku && input.sku !== current.sku) {
      if (await repo.skuExists(tx, ctx.businessId, input.sku, id)) {
        throw new ConflictError(
          `Ya existe un producto con el SKU "${input.sku}".`,
        );
      }
    }

    if (input.barcode && input.barcode !== current.barcode) {
      if (await repo.barcodeExists(tx, ctx.businessId, input.barcode, id)) {
        throw new ConflictError(
          `El código de barras "${input.barcode}" ya está asignado a otro producto.`,
        );
      }
    }

    await assertReferencesBelongToBusiness(tx, ctx.businessId, input);

    const product = await repo.updateProduct(tx, id, {
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(input.supplierId !== undefined
        ? { supplierId: input.supplierId }
        : {}),
      ...(input.taxRateId !== undefined ? { taxRateId: input.taxRateId } : {}),
      ...(input.priceCents !== undefined
        ? { priceCents: input.priceCents }
        : {}),
      ...(input.costCents !== undefined ? { costCents: input.costCents } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.minStock !== undefined ? { minStock: input.minStock } : {}),
      ...(input.tracksInventory !== undefined
        ? { tracksInventory: input.tracksInventory }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.satProductCode !== undefined
        ? { satProductCode: input.satProductCode }
        : {}),
      ...(input.satUnitCode !== undefined
        ? { satUnitCode: input.satUnitCode }
        : {}),
    });

    // Solo se registran los campos que realmente cambiaron: una bitácora que
    // guarda el objeto entero en cada edición es ilegible cuando hace falta.
    const changes = diff(current, product);

    if (Object.keys(changes.after).length > 0) {
      await audit(tx, ctx, {
        action: AUDIT_ACTIONS.PRODUCT_UPDATE,
        entityType: "Product",
        entityId: id,
        before: changes.before,
        after: changes.after,
        metadata: { sku: product.sku, name: product.name },
      });
    }

    return product;
  });
}

/**
 * Elimina un producto (borrado lógico).
 *
 * NUNCA se borra físicamente: las ventas y compras históricas lo referencian y
 * borrarlo dejaría tickets huérfanos. Se marca `deletedAt` y desaparece de los
 * listados, pero el histórico sigue íntegro (requisito 14).
 */
export async function remove(ctx: RequestContext, id: string) {
  requirePermission(ctx, PERMISSIONS.PRODUCTS_DELETE);

  return transaction(async (tx) => {
    const current = await tx.product.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
      select: { id: true, sku: true, name: true, stock: true },
    });

    if (!current) throw new NotFoundError("El producto", id);

    // Advertencia deliberada, no bloqueo: eliminar un producto con existencia
    // suele ser un error de captura, pero hay casos legítimos (merma total,
    // producto descontinuado). Se permite y queda registrado.
    const deleted = await repo.softDeleteProduct(tx, id);

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.PRODUCT_DELETE,
      entityType: "Product",
      entityId: id,
      before: { sku: current.sku, name: current.name, stock: current.stock },
      metadata: {
        stockAlEliminar: current.stock,
        borradoLogico: true,
      },
    });

    return deleted;
  });
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

/**
 * Verifica que categoría, proveedor y tasa pertenezcan al MISMO negocio.
 *
 * Sin esta comprobación, un usuario podría enviar el id de una categoría de
 * otro negocio y crear una referencia cruzada entre tenants. La clave foránea
 * de la base de datos no lo impide: es válida, solo que apunta fuera.
 */
async function assertReferencesBelongToBusiness(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  businessId: string,
  input: { categoryId?: string | null; supplierId?: string | null; taxRateId?: string | null },
) {
  if (input.categoryId) {
    const category = await tx.category.findFirst({
      where: { id: input.categoryId, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!category) throw new ValidationError("La categoría seleccionada no existe.");
  }

  if (input.supplierId) {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!supplier) throw new ValidationError("El proveedor seleccionado no existe.");
  }

  if (input.taxRateId) {
    const taxRate = await tx.taxRate.findFirst({
      where: { id: input.taxRateId, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!taxRate) throw new ValidationError("La tasa de impuesto seleccionada no existe.");
  }
}

/** Campos que tiene sentido registrar en la bitácora al editar un producto. */
const AUDITED_FIELDS = [
  "sku",
  "name",
  "priceCents",
  "costCents",
  "minStock",
  "status",
  "unit",
  "tracksInventory",
] as const;

function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const field of AUDITED_FIELDS) {
    if (before[field] !== after[field]) {
      changedBefore[field] = before[field];
      changedAfter[field] = after[field];
    }
  }

  return { before: changedBefore, after: changedAfter };
}
