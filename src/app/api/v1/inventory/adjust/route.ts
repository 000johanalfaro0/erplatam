import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import { adjustStock, stockAdjustmentSchema } from "@/server/modules/inventory";

/**
 * POST /api/v1/inventory/adjust
 *
 * Ajuste por conteo físico. Se envía la cantidad CONTADA, no la diferencia:
 * quien hace inventario cuenta piezas, no calcula restas.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const input = stockAdjustmentSchema.parse(await readJson(request));

  return ok(await adjustStock(ctx, input));
});
