import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import { voidPurchase, voidPurchaseSchema } from "@/server/modules/purchases";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/purchases/:id/void
 *
 * Cancela la compra y saca del inventario la mercancía que había entrado.
 * Si esa mercancía ya se vendió, se rechaza: sacarla dejaría el inventario en
 * un estado imposible.
 */
export const POST = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = voidPurchaseSchema.parse(await readJson(request));

  return ok(await voidPurchase(ctx, id, input));
});
