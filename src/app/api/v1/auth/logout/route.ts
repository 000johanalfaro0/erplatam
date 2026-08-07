import type { NextResponse } from "next/server";

import { getOptionalContext } from "@/server/http/context";
import { ok, route } from "@/server/http/response";
import {
  clearSessionCookie,
  readSessionToken,
} from "@/server/http/session-cookie";
import { logout } from "@/server/modules/auth";

/**
 * POST /api/v1/auth/logout
 *
 * Idempotente: cerrar una sesión que ya no existe devuelve 200 igualmente.
 * Un cierre de sesión que falla porque "ya estabas fuera" solo genera
 * confusión en la interfaz.
 */
export const POST = route(async () => {
  const [token, context] = await Promise.all([
    readSessionToken(),
    getOptionalContext(),
  ]);

  await logout(token, context);

  const response = ok({ ok: true });
  clearSessionCookie(response as NextResponse);

  return response;
});
