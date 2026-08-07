import { TZDate } from "@date-fns/tz";
import { format, startOfMonth } from "date-fns";
import type { Metadata } from "next";

import { db } from "@/server/core/db";
import { requireContext } from "@/server/http/context";
import { periodSummary } from "@/server/modules/reports";

import { ReportesClient } from "./reportes-client";

export const metadata: Metadata = { title: "Reportes" };

/**
 * Reportes — envoltorio de servidor.
 *
 * Se resuelve el resumen del mes en curso, que es el reporte que se abre por
 * defecto. Los demás y los otros rangos se piden desde el cliente al
 * seleccionarlos.
 *
 * El rango se calcula en la ZONA DEL NEGOCIO, no en UTC, para que coincida
 * exactamente con el que el cliente enviará después. Si no coincidiera,
 * TanStack Query trataría ambos como consultas distintas y pediría los datos
 * igualmente, anulando la ventaja.
 */
export default async function ReportesPage() {
  const ctx = await requireContext();

  const settings = await db.businessSettings.findUnique({
    where: { businessId: ctx.businessId },
    select: { timezone: true },
  });

  const zona = settings?.timezone ?? "America/Mexico_City";
  const hoy = new TZDate(new Date(), zona);

  const from = format(startOfMonth(hoy), "yyyy-MM-dd");
  const to = format(hoy, "yyyy-MM-dd");

  const resumen = await periodSummary(ctx, { from, to, granularity: "day" });

  return <ReportesClient initialSummary={resumen} />;
}
