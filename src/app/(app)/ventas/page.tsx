import type { Metadata } from "next";

import { requireContext } from "@/server/http/context";
import { listSales, listSalesSchema } from "@/server/modules/sales";

import { VentasClient } from "./ventas-client";

export const metadata: Metadata = { title: "Ventas" };

/**
 * Ventas — envoltorio de servidor.
 * Ver `inventario/page.tsx` para el porqué de este patrón.
 */
export default async function VentasPage() {
  const ctx = await requireContext();

  // Los mismos valores por defecto que usa el cliente.
  const filtros = listSalesSchema.parse({
    page: 1,
    pageSize: 25,
    sortBy: "createdAt",
    sortDir: "desc",
  });

  return <VentasClient initialData={(await listSales(ctx, filtros)) as never} />;
}
