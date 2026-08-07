import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, ok, readJson, route } from "@/server/http/response";
import {
  createPurchase,
  createPurchaseSchema,
  listPurchases,
  listPurchasesSchema,
} from "@/server/modules/purchases";

export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await listPurchases(ctx, listPurchasesSchema.parse(params)));
});

/**
 * POST /api/v1/purchases
 *
 * Registra la compra Y la recibe en inventario en la misma transacción.
 * Además actualiza el costo de cada producto, que es lo que mantiene el margen
 * del panel pegado a la realidad.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const input = createPurchaseSchema.parse(await readJson(request));
  return created(await createPurchase(ctx, input));
});
