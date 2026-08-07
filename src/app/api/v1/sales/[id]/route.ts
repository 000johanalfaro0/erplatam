import { requireContext } from "@/server/http/context";
import { ok, route } from "@/server/http/response";
import { getSale } from "@/server/modules/sales";

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/sales/:id — detalle completo del ticket. */
export const GET = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;

  return ok(await getSale(ctx, id));
});
