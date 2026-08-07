import { z } from "zod";

import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import {
  getDiscovery,
  saveDiscovery,
  saveDiscoverySchema,
} from "@/server/modules/discovery";

/** GET /api/v1/discovery?formVersion=1 */
export const GET = route(async (request: Request) => {
  const ctx = await requireContext();

  const formVersion = z.coerce
    .number()
    .int()
    .min(1)
    .default(1)
    .parse(new URL(request.url).searchParams.get("formVersion") ?? undefined);

  // Devuelve null si aún no se ha respondido. No es un 404: "todavía no hay
  // respuestas" es un estado normal, no un error.
  return ok(await getDiscovery(ctx, formVersion));
});

/**
 * PUT /api/v1/discovery
 *
 * Es PUT y no POST: guardar sustituye la respuesta anterior del mismo
 * formulario, no crea una nueva. Reenviar lo mismo dos veces deja el sistema
 * en el mismo estado.
 */
export const PUT = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const input = saveDiscoverySchema.parse(await readJson(request));
  return ok(await saveDiscovery(ctx, input));
});
