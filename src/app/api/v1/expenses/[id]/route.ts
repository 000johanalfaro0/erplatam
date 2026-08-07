import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import {
  deleteExpense,
  updateExpense,
  updateExpenseSchema,
} from "@/server/modules/expenses";

type Params = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = updateExpenseSchema.parse(await readJson(request));

  return ok(await updateExpense(ctx, id, input));
});

/** Borrado lógico: deja de contar en reportes pero conserva su rastro. */
export const DELETE = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  return ok(await deleteExpense(ctx, id));
});
