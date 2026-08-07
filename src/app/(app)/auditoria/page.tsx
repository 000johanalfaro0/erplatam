import type { Metadata } from "next";

import { requireContext } from "@/server/http/context";
import { listAudit, listAuditSchema } from "@/server/modules/audit";

import { AuditoriaClient } from "./auditoria-client";

export const metadata: Metadata = { title: "Auditoría" };

/**
 * Auditoría — envoltorio de servidor.
 * Ver `inventario/page.tsx` para el porqué de este patrón.
 */
export default async function AuditoriaPage() {
  const ctx = await requireContext();
  const filtros = listAuditSchema.parse({ page: 1, pageSize: 50 });

  return <AuditoriaClient initialData={(await listAudit(ctx, filtros)) as never} />;
}
