import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, ok, readJson, route } from "@/server/http/response";
import {
  create,
  createProductSchema,
  list,
  listProductsSchema,
} from "@/server/modules/products";

/** GET /api/v1/products — listado paginado con filtros. */
export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const input = listProductsSchema.parse(params);

  return ok(await list(ctx, input));
});

/** POST /api/v1/products — alta de producto. */
export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const input = createProductSchema.parse(await readJson(request));

  return created(await create(ctx, input));
});
