import type { Metadata } from "next";

import { requireContext } from "@/server/http/context";
import { list, listProductsSchema } from "@/server/modules/products";

import { InventarioClient } from "./inventario-client";

export const metadata: Metadata = { title: "Inventario" };

/**
 * Inventario — envoltorio de servidor.
 *
 * Los datos se leen aquí, DENTRO del mismo viaje que la página, en lugar de
 * pedirlos por API al montar el componente. Medido en producción: 631 ms con
 * dos viajes frente a 386 ms con uno.
 *
 * No se pierde interactividad: el cliente sigue usando TanStack Query para
 * filtros, búsqueda y paginación. Solo la primera carga viene resuelta.
 *
 * Los catálogos de referencia NO se piden aquí: los siembra el layout para
 * todas las pantallas a la vez.
 */
export default async function InventarioPage() {
  const ctx = await requireContext();

  // Los mismos valores por defecto que usa el cliente, para que TanStack Query
  // reconozca estos datos como los de su primera consulta.
  const filtros = listProductsSchema.parse({
    page: 1,
    pageSize: 25,
    sortBy: "name",
    sortDir: "asc",
  });

  return <InventarioClient initialData={(await list(ctx, filtros)) as never} />;
}
