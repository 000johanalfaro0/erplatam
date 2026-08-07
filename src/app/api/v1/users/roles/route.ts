import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, route } from "@/server/http/response";
import { listRoles } from "@/server/modules/users";

export const GET = route(async () => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  return ok(await listRoles(ctx));
});
