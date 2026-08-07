import { NextResponse } from "next/server";

import { getClientIp, getUserAgent } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, readJson, route } from "@/server/http/response";
import { setSessionCookie } from "@/server/http/session-cookie";
import { login, loginSchema } from "@/server/modules/auth";

/**
 * POST /api/v1/auth/login
 *
 * La ruta es deliberadamente delgada: valida, limita, delega en el servicio y
 * traduce el resultado a HTTP. Ni una regla de negocio vive aquí.
 */
export const POST = route(async (request: Request) => {
  const body = await readJson(request);
  const input = loginSchema.parse(body);

  const [ip, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);

  // La clave combina IP y correo: así, alguien que ataca una cuenta no puede
  // agotar de paso el cupo de los demás usuarios que salen por la misma IP.
  consumeRateLimit(`login:${ip ?? "unknown"}:${input.email}`, RATE_LIMITS.login);

  const result = await login(input, { ip, userAgent });

  const response = ok({
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      roleKey: result.user.roleKey,
      permissions: result.user.permissions,
      businessId: result.user.businessId,
      businessName: result.user.businessName,
    },
  });

  setSessionCookie(response as NextResponse, result.token, result.expiresAt);

  return response;
});
