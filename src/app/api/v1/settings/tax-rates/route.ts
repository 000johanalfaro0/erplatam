import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, ok, readJson, route } from "@/server/http/response";
import {
  createTaxRate,
  createTaxRateSchema,
  listTaxRates,
} from "@/server/modules/settings";

export const GET = route(async () => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  return ok(await listTaxRates(ctx));
});

export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const input = createTaxRateSchema.parse(await readJson(request));
  return created(await createTaxRate(ctx, input));
});
