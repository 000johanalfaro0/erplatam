import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import {
  deleteSupplier,
  getSupplier,
  updateSupplier,
  updateSupplierSchema,
} from "@/server/modules/suppliers";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  return ok(await getSupplier(ctx, id));
});

export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = updateSupplierSchema.parse(await readJson(request));
  return ok(await updateSupplier(ctx, id, input));
});

export const DELETE = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  return ok(await deleteSupplier(ctx, id));
});
