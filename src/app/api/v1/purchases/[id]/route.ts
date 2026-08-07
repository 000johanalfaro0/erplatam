import { requireContext } from "@/server/http/context";
import { ok, route } from "@/server/http/response";
import { getPurchase } from "@/server/modules/purchases";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;
  return ok(await getPurchase(ctx, id));
});
