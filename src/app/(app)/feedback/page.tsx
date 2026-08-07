import type { Metadata } from "next";

import { requireContext } from "@/server/http/context";
import { listFeedback, listFeedbackSchema } from "@/server/modules/feedback";

import { FeedbackClient } from "./feedback-client";

export const metadata: Metadata = { title: "Feedback" };

/**
 * Feedback — envoltorio de servidor.
 * Ver `inventario/page.tsx` para el porqué de este patrón.
 */
export default async function FeedbackPage() {
  const ctx = await requireContext();

  // La pestaña por defecto del cliente es "Pendiente".
  const filtros = listFeedbackSchema.parse({
    status: "PENDING",
    page: 1,
    pageSize: 50,
  });

  return <FeedbackClient initialData={(await listFeedback(ctx, filtros)) as never} />;
}
