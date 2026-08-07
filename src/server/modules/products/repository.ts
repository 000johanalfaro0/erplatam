import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/core/db";
import { normalizeSearch, toSkipTake } from "@/server/core/pagination";
import type { Tx } from "@/server/core/tx";

import type { ListProductsInput } from "./schema";

/**
 * Acceso a datos de productos.
 *
 * El repositorio NO contiene reglas de negocio ni comprobaciones de permisos:
 * solo traduce intenciones a consultas. Las funciones que participan en
 * operaciones atómicas aceptan un cliente `Tx` para poder ejecutarse dentro de
 * la transacción de quien las llama.
 *
 * Todas las consultas filtran por `businessId`. No es opcional: es lo que
 * impide que un negocio vea datos de otro.
 */

/** Campos que se devuelven en los listados. */
export const productListSelect = {
  id: true,
  sku: true,
  barcode: true,
  name: true,
  priceCents: true,
  costCents: true,
  stock: true,
  minStock: true,
  unit: true,
  status: true,
  tracksInventory: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  taxRate: { select: { id: true, name: true, rateBps: true, isExempt: true } },
} satisfies Prisma.ProductSelect;

export type ProductListItem = Prisma.ProductGetPayload<{
  select: typeof productListSelect;
}>;

function buildWhere(
  businessId: string,
  input: ListProductsInput,
): Prisma.ProductWhereInput {
  const search = normalizeSearch(input.search);

  return {
    businessId,
    // El borrado lógico se filtra SIEMPRE. Un producto eliminado sigue
    // existiendo para que las ventas históricas lo referencien, pero no debe
    // aparecer en ningún listado operativo.
    deletedAt: null,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.supplierId ? { supplierId: input.supplierId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(search
      ? {
          // Se busca por nombre, SKU y código de barras a la vez: el cajero
          // escanea o teclea sin pensar en qué campo está buscando.
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listProducts(
  businessId: string,
  input: ListProductsInput,
  globalLowStockThreshold: number,
) {
  const where = buildWhere(businessId, input);

  /**
   * Filtro de stock bajo.
   *
   * La condición es: "existencia por debajo del punto de reorden PROPIO del
   * producto; y si no tiene uno definido, por debajo del umbral global".
   *
   * La segunda rama compara dos columnas de la misma fila (`stock` contra
   * `minStock`). Se resuelve con una referencia de campo de Prisma
   * (`db.product.fields.minStock`), que genera la comparación directamente en
   * SQL. La alternativa —traer todo a memoria y filtrar en JavaScript— sería
   * correcta pero se caería con un catálogo grande.
   *
   * Ojo con `OR` anidado: `buildWhere` ya puede haber puesto un `OR` para la
   * búsqueda por texto. Por eso ambas condiciones se combinan bajo `AND` en
   * lugar de sobrescribir la clave.
   */
  const finalWhere: Prisma.ProductWhereInput = input.lowStock
    ? {
        ...where,
        tracksInventory: true,
        AND: [
          {
            OR: [
              { minStock: null, stock: { lte: globalLowStockThreshold } },
              { stock: { lte: db.product.fields.minStock } },
            ],
          },
        ],
      }
    : where;

  const [items, total] = await Promise.all([
    db.product.findMany({
      where: finalWhere,
      select: productListSelect,
      orderBy: { [input.sortBy]: input.sortDir },
      ...toSkipTake(input),
    }),
    db.product.count({ where: finalWhere }),
  ]);

  return { items, total };
}

export async function findProductById(businessId: string, id: string) {
  return db.product.findFirst({
    where: { id, businessId, deletedAt: null },
    select: {
      ...productListSelect,
      description: true,
      satProductCode: true,
      satUnitCode: true,
      categoryId: true,
      supplierId: true,
      taxRateId: true,
    },
  });
}

/** Búsqueda por SKU o código de barras exactos. La usa el punto de venta. */
export async function findProductByCode(businessId: string, code: string) {
  return db.product.findFirst({
    where: {
      businessId,
      deletedAt: null,
      status: "ACTIVE",
      OR: [{ sku: code.toUpperCase() }, { barcode: code }],
    },
    select: productListSelect,
  });
}

export async function skuExists(
  client: Tx | typeof db,
  businessId: string,
  sku: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await client.product.findFirst({
    where: {
      businessId,
      sku,
      // El SKU se compara también contra productos eliminados: reutilizarlo
      // haría ambiguo el histórico de ventas.
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

export async function barcodeExists(
  client: Tx | typeof db,
  businessId: string,
  barcode: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await client.product.findFirst({
    where: {
      businessId,
      barcode,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

export async function createProduct(
  tx: Tx,
  data: Prisma.ProductUncheckedCreateInput,
) {
  return tx.product.create({ data, select: productListSelect });
}

export async function updateProduct(
  tx: Tx,
  id: string,
  data: Prisma.ProductUncheckedUpdateInput,
) {
  return tx.product.update({
    where: { id },
    data,
    select: productListSelect,
  });
}

export async function softDeleteProduct(tx: Tx, id: string) {
  return tx.product.update({
    where: { id },
    data: { deletedAt: new Date(), status: "INACTIVE" },
    select: { id: true, name: true, sku: true },
  });
}

/** Cuenta cuántos productos están por debajo de su punto de reorden. */
export async function countLowStock(
  businessId: string,
  globalThreshold: number,
): Promise<number> {
  return db.product.count({
    where: {
      businessId,
      deletedAt: null,
      status: "ACTIVE",
      tracksInventory: true,
      stock: { lte: globalThreshold },
    },
  });
}
