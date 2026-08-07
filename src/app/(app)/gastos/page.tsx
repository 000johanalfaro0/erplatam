import type { Metadata } from "next";

import { requireContext } from "@/server/http/context";
import { listExpenses, listExpensesSchema } from "@/server/modules/expenses";

import { GastosClient } from "./gastos-client";

export const metadata: Metadata = { title: "Gastos" };

/**
 * Gastos — envoltorio de servidor.
 * Ver `inventario/page.tsx` para el porqué de este patrón.
 */
export default async function GastosPage() {
  const ctx = await requireContext();
  const filtros = listExpensesSchema.parse({ page: 1, pageSize: 25 });

  return <GastosClient initialData={(await listExpenses(ctx, filtros)) as never} />;
}
