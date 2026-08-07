import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, route } from "@/server/http/response";
import { listMovements, listMovementsSchema } from "@/server/modules/inventory";

/**
 * GET /api/v1/inventory/movements
 *
 * Kardex: el historial que responde "¿por qué este producto tiene esta
 * existencia?". Filtrable por producto, tipo y rango de fechas.
 */
export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const input = listMovementsSchema.parse(params);

  return ok(await listMovements(ctx, input));
});
