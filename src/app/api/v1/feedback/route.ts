import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, ok, readJson, route } from "@/server/http/response";
import {
  createFeedback,
  createFeedbackSchema,
  listFeedback,
  listFeedbackSchema,
} from "@/server/modules/feedback";

export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await listFeedback(ctx, listFeedbackSchema.parse(params)));
});

/**
 * POST /api/v1/feedback
 *
 * Usa el límite de subida (más estricto) porque el cuerpo puede llevar una
 * captura de pantalla de hasta 3 MB.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`upload:${ctx.userId}`, RATE_LIMITS.upload);

  const input = createFeedbackSchema.parse(await readJson(request));
  return created(await createFeedback(ctx, input));
});
