import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import {
  getById,
  remove,
  update,
  updateProductSchema,
} from "@/server/modules/products";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/products/:id */
export const GET = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;

  return ok(await getById(ctx, id));
});

/** PATCH /api/v1/products/:id */
export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = updateProductSchema.parse(await readJson(request));

  return ok(await update(ctx, id, input));
});

/**
 * DELETE /api/v1/products/:id
 *
 * Borrado lógico. El producto deja de aparecer en los listados pero sigue
 * existiendo para las ventas históricas que lo referencian.
 */
export const DELETE = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;

  return ok(await remove(ctx, id));
});
