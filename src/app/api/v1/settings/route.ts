import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import {
  getSettings,
  updateSettings,
  updateSettingsSchema,
} from "@/server/modules/settings";

export const GET = route(async () => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  return ok(await getSettings(ctx));
});

export const PATCH = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const input = updateSettingsSchema.parse(await readJson(request));
  return ok(await updateSettings(ctx, input));
});
