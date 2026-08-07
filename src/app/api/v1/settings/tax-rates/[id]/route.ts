import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import {
  archiveTaxRate,
  updateTaxRate,
  updateTaxRateSchema,
} from "@/server/modules/settings";

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = updateTaxRateSchema.parse(await readJson(request));

  return ok(await updateTaxRate(ctx, id, input));
});

/**
 * Archiva, no borra. Una tasa referenciada por ventas históricas no puede
 * desaparecer, y el módulo además se niega si algún producto vivo la usa.
 */
export const DELETE = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  return ok(await archiveTaxRate(ctx, id));
});
