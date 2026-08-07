import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import { updateUser, updateUserSchema } from "@/server/modules/users";

type Params = { params: Promise<{ id: string }> };

/**
 * No hay DELETE a propósito. Las ventas, los movimientos de inventario y la
 * bitácora de auditoría referencian al usuario; borrarlo dejaría el historial
 * sin autor. Dar de baja es `PATCH { status: "INACTIVE" }`, que además cierra
 * sus sesiones al instante.
 */
export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireContext();
  consumeRateLimit(`write:${ctx.userId}`, RATE_LIMITS.write);

  const { id } = await params;
  const input = updateUserSchema.parse(await readJson(request));

  return ok(await updateUser(ctx, id, input));
});
