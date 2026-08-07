import { db } from "@/server/core/db";
import { requireContext } from "@/server/http/context";
import { ok, route } from "@/server/http/response";

/**
 * GET /api/v1/reference
 *
 * Devuelve en UNA sola petición todos los catálogos que los formularios
 * necesitan para poblar sus desplegables: categorías, proveedores, tasas de
 * impuesto, métodos de pago y categorías de gasto.
 *
 * Por qué un endpoint agregado en lugar de cinco:
 * un formulario de producto necesita tres de estas listas. Con endpoints
 * separados serían tres peticiones en cascada y tres estados de carga
 * distintos que gestionar en la interfaz. Son datos pequeños, estables y que
 * casi siempre se piden juntos, así que agruparlos es más rápido y más simple.
 *
 * La interfaz lo cachea con TanStack Query y lo comparte entre pantallas.
 */
export const GET = route(async () => {
  const ctx = await requireContext();

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
        select: {
          id: true,
          code: true,
          name: true,
          requiresChange: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
      db.expenseCategory.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      }),
    ]);

  return ok({
    categories,
    suppliers,
    taxRates,
    paymentMethods,
    expenseCategories,
  });
});
