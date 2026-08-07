import type { Metadata } from "next";

import { db } from "@/server/core/db";
import { requireContext } from "@/server/http/context";
import { list, listProductsSchema } from "@/server/modules/products";

import { InventarioClient } from "./inventario-client";

export const metadata: Metadata = { title: "Inventario" };

/**
 * Inventario — envoltorio de servidor.
 *
 * POR QUÉ EXISTE ESTA CAPA
 * ---------------------------------------------------------------------------
 * Antes esta pantalla era un componente de cliente que pedía sus datos por
 * API al montarse. Eso son DOS viajes secuenciales al servidor:
 *
 *     1. cargar la página (vacía)     ~310 ms
 *     2. pedir los datos por API      ~310 ms
 *                                     ─────────
 *     hasta ver contenido             ~620 ms
 *
 * Medido en producción, no estimado. El usuario veía un esqueleto durante
 * medio segundo en cada navegación, y eso es exactamente lo que hace que una
 * aplicación "se sienta lenta" aunque cada petición individual sea rápida.
 *
 * Ahora los datos se leen en el servidor, DENTRO del mismo viaje que la
 * página, y llegan ya renderizados. Un solo viaje.
 *
 * Lo importante: no se pierde nada de la interactividad. El componente de
 * cliente sigue usando TanStack Query igual que antes —filtros, búsqueda,
 * paginación, refresco tras guardar—, solo que su primera carga ya viene
 * resuelta en lugar de tener que pedirla.
 *
 * Se llama a los servicios de dominio directamente, no a la API por HTTP:
 * el servidor no necesita hablar consigo mismo por red.
 */
export default async function InventarioPage() {
  const ctx = await requireContext();

  // Los mismos valores por defecto que usa el cliente, para que la caché de
  // TanStack Query reconozca estos datos como los de su primera consulta.
  const filtrosIniciales = listProductsSchema.parse({
    page: 1,
    pageSize: 25,
    sortBy: "name",
    sortDir: "asc",
  });

  const [productos, categories, suppliers, taxRates, paymentMethods, expenseCategories] =
    await Promise.all([
      list(ctx, filtrosIniciales),
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

  return (
    <InventarioClient
      // `JSON.parse(JSON.stringify(...))` no hace falta: Next serializa las
      // props automáticamente al cruzar la frontera servidor→cliente.
      initialData={productos as never}
      initialReference={{
        categories,
        suppliers,
        taxRates,
        paymentMethods,
        expenseCategories,
      }}
    />
  );
}
