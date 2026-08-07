import type { Metadata } from "next";

import { requireContext } from "@/server/http/context";
import { listSuppliers, listSuppliersSchema } from "@/server/modules/suppliers";

import { ProveedoresClient } from "./proveedores-client";

export const metadata: Metadata = { title: "Proveedores" };

/**
 * Proveedores — envoltorio de servidor.
 * Ver `inventario/page.tsx` para el porqué de este patrón.
 */
export default async function ProveedoresPage() {
  const ctx = await requireContext();
  const filtros = listSuppliersSchema.parse({ page: 1, pageSize: 25 });

  return (
    <ProveedoresClient initialData={(await listSuppliers(ctx, filtros)) as never} />
  );
}
