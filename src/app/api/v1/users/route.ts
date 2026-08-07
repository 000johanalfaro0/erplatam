import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, ok, readJson, route } from "@/server/http/response";
import { createUser, createUserSchema, listUsers } from "@/server/modules/users";

export const GET = route(async () => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  return ok(await listUsers(ctx));
});

export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const input = createUserSchema.parse(await readJson(request));
  return created(await createUser(ctx, input));
});
