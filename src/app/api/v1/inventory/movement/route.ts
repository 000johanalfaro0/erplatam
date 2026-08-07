import { z } from "zod";

import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, readJson, route } from "@/server/http/response";
import {
  registerEntry,
  registerExit,
  stockMovementSchema,
} from "@/server/modules/inventory";

/**
 * POST /api/v1/inventory/movement
 *
 * Entrada o salida manual de mercancía, sin documento de compra o venta
 * detrás. Casos reales: merma, caducidad, rotura, consumo interno, hallazgo
 * en conteo, traspaso.
 *
 * El motivo es obligatorio (lo exige el esquema): un movimiento sin
 * justificación es un agujero contable.
 */
const bodySchema = stockMovementSchema.extend({
  direction: z.enum(["ENTRY", "EXIT"], {
    message: "Indica si es entrada o salida",
  }),
});

export const POST = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { direction, ...input } = bodySchema.parse(await readJson(request));

  const result =
    direction === "ENTRY"
      ? await registerEntry(ctx, input)
      : await registerExit(ctx, input);

  return created(result);
});
