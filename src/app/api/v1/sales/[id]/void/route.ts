import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import { voidSaleSchema, voidSale } from "@/server/modules/sales";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/sales/:id/void — cancela una venta.
 *
 * Es POST y no DELETE deliberadamente: la venta NO se borra. Se registra un
 * hecho nuevo — su cancelación — que revierte el inventario y queda auditado.
 * El verbo debe reflejar lo que ocurre de verdad.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = voidSaleSchema.parse(await readJson(request));

  return ok(await voidSale(ctx, id, input));
});
