import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import {
  updatePaymentMethod,
  updatePaymentMethodSchema,
} from "@/server/modules/settings";

type Params = { params: Promise<{ id: string }> };

/**
 * No hay DELETE a propósito: los métodos de pago se desactivan
 * (`isActive: false`) porque los pagos históricos los referencian. Desactivar
 * es `PATCH { isActive: false }`, y el módulo impide dejar cero activos.
 */
export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = updatePaymentMethodSchema.parse(await readJson(request));

  return ok(await updatePaymentMethod(ctx, id, input));
});
