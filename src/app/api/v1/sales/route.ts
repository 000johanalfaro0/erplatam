import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, ok, readJson, route } from "@/server/http/response";
import {
  createSale,
  createSaleSchema,
  listSales,
  listSalesSchema,
} from "@/server/modules/sales";

/** GET /api/v1/sales */
export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const input = listSalesSchema.parse(params);

  return ok(await listSales(ctx, input));
});

/**
 * POST /api/v1/sales — registra una venta.
 *
 * Admite `idempotencyKey` en el cuerpo: reenviar la misma clave devuelve la
 * venta ya creada en lugar de duplicarla.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const input = createSaleSchema.parse(await readJson(request));

  return created(await createSale(ctx, input));
});
