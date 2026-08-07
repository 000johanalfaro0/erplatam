import { z } from "zod";

import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, ok, readJson, route } from "@/server/http/response";
import {
  createCategory,
  createCategorySchema,
  createExpenseCategory,
  listCategories,
  listCategoriesSchema,
  listExpenseCategories,
} from "@/server/modules/categories";

/**
 * GET|POST /api/v1/categories?kind=product|expense
 *
 * Un solo endpoint para ambos tipos de categoría. Son la misma forma de dato y
 * la misma pantalla de administración; separarlos en dos rutas duplicaría el
 * código sin aportar nada. El parámetro `kind` elige la tabla, y la
 * autorización se resuelve dentro de cada módulo con su permiso propio.
 */
const kindSchema = z.enum(["product", "expense"]).default("product");

export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const kind = kindSchema.parse(params.kind);
  const input = listCategoriesSchema.parse(params);

  return ok(
    kind === "expense"
      ? await listExpenseCategories(ctx, input)
      : await listCategories(ctx, input),
  );
});

export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const kind = kindSchema.parse(
    new URL(request.url).searchParams.get("kind") ?? undefined,
  );
  const input = createCategorySchema.parse(await readJson(request));

  return created(
    kind === "expense"
      ? await createExpenseCategory(ctx, input)
      : await createCategory(ctx, input),
  );
});
