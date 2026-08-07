import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import {
  deleteCustomer,
  getCustomer,
  updateCustomer,
  updateCustomerSchema,
} from "@/server/modules/customers";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  return ok(await getCustomer(ctx, id));
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = updateCustomerSchema.parse(await readJson(request));
  return ok(await updateCustomer(ctx, id, input));
});

/** Borrado lógico: las ventas históricas conservan la referencia al cliente. */
export const DELETE = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  return ok(await deleteCustomer(ctx, id));
});
