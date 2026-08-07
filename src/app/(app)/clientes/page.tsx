import type { Metadata } from "next";

import { requireContext } from "@/server/http/context";
import { listCustomers, listCustomersSchema } from "@/server/modules/customers";

import { ClientesClient } from "./clientes-client";

export const metadata: Metadata = { title: "Clientes" };

/**
 * Clientes — envoltorio de servidor.
 *
 * Ver `inventario/page.tsx` para el porqué de este patrón: la primera página
 * se lee aquí, dentro del mismo viaje que la página, en lugar de pedirla por
 * API al montar el componente.
 */
export default async function ClientesPage() {
  const ctx = await requireContext();

  // Los mismos valores por defecto que usa el cliente, para que TanStack Query
  // reconozca estos datos como los de su primera consulta.
  const filtros = listCustomersSchema.parse({ page: 1, pageSize: 25 });

  return <ClientesClient initialData={(await listCustomers(ctx, filtros)) as never} />;
}
