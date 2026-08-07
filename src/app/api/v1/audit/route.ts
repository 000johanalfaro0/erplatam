import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, route } from "@/server/http/response";
import { listAudit, listAuditSchema } from "@/server/modules/audit";

/**
 * GET /api/v1/audit — visor de la bitácora (requisito 14).
 *
 * Solo lectura. La bitácora no tiene endpoints de escritura ni de borrado a
 * propósito: se escribe únicamente desde dentro de las transacciones que
 * audita. Exponer un POST permitiría fabricar entradas falsas, y un DELETE
 * anularía todo su propósito.
 */
export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await listAudit(ctx, listAuditSchema.parse(params)));
});
