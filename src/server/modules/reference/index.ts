import type { RequestContext } from "@/server/core/context";
import { db } from "@/server/core/db";

/**
 * Catálogos de referencia: categorías, proveedores, tasas, métodos de pago y
 * categorías de gasto.
 *
 * Vive en su propio módulo porque lo consumen DOS caminos distintos:
 *
 *   - El endpoint `/api/v1/reference`, para refrescos desde el navegador.
 *   - El layout protegido, que los resuelve en el servidor y los entrega ya
 *     dentro del primer render.
 *
 * Lo segundo es lo que ahorra una petición en CADA pantalla: son datos que
 * casi ninguna pantalla puede pintar sin ellos (desplegables de categoría, de
 * proveedor, de método de pago) y que casi nunca cambian.
 */

export interface ReferenceData {
  categories: { id: string; name: string; color: string | null }[];
  suppliers: { id: string; name: string }[];
  taxRates: {
    id: string;
    name: string;
    rateBps: number;
    isExempt: boolean;
    isDefault: boolean;
  }[];
  paymentMethods: {
    id: string;
    code: string;
    name: string;
    requiresChange: boolean;
  }[];
  expenseCategories: { id: string; name: string; color: string | null }[];
}

export async function getReferenceData(
  ctx: RequestContext,
): Promise<ReferenceData> {
  const [categories, suppliers, taxRates, paymentMethods, expenseCategories] =
    await Promise.all([
      db.category.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      }),
      db.supplier.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.taxRate.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: {
          id: true,
          name: true,
          rateBps: true,
          isExempt: true,
          isDefault: true,
        },
        orderBy: { rateBps: "desc" },
      }),
      db.paymentMethod.findMany({
        where: { businessId: ctx.businessId, isActive: true },
        select: { id: true, code: true, name: true, requiresChange: true },
        orderBy: { sortOrder: "asc" },
      }),
      db.expenseCategory.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      }),
    ]);

  return { categories, suppliers, taxRates, paymentMethods, expenseCategories };
}
