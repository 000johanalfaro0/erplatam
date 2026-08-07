import { z } from "zod";

import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import {
  deleteCategory,
  deleteExpenseCategory,
  updateCategory,
  updateCategorySchema,
  updateExpenseCategory,
} from "@/server/modules/categories";

type Params = { params: Promise<{ id: string }> };

const kindSchema = z.enum(["product", "expense"]).default("product");

function kindOf(request: Request) {
  return kindSchema.parse(
    new URL(request.url).searchParams.get("kind") ?? undefined,
  );
}

export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = updateCategorySchema.parse(await readJson(request));

  return ok(
    kindOf(request) === "expense"
      ? await updateExpenseCategory(ctx, id, input)
      : await updateCategory(ctx, id, input),
  );
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;

  return ok(
    kindOf(request) === "expense"
      ? await deleteExpenseCategory(ctx, id)
      : await deleteCategory(ctx, id),
  );
});
