import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, ok, readJson, route } from "@/server/http/response";
import {
  createCustomer,
  createCustomerSchema,
  listCustomers,
  listCustomersSchema,
} from "@/server/modules/customers";

export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await listCustomers(ctx, listCustomersSchema.parse(params)));
});

export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const input = createCustomerSchema.parse(await readJson(request));
  return created(await createCustomer(ctx, input));
});
