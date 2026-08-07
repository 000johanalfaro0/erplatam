import { paginationSchema } from "@/server/core/pagination";
import { requireContext } from "@/server/http/context";
import { ok, route } from "@/server/http/response";
import { getCustomerHistory } from "@/server/modules/customers";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/customers/:id/history
 *
 * Historial de compras del cliente con su resumen: total gastado, ticket
 * promedio y última compra. Esas tres cifras responden "¿cuánto vale este
 * cliente?", que es la pregunta real detrás de abrir su historial.
 */
export const GET = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;

  const query = Object.fromEntries(new URL(request.url).searchParams);
  const { page, pageSize } = paginationSchema.parse(query);

  return ok(await getCustomerHistory(ctx, id, { page, pageSize }));
});
