import { NextResponse } from "next/server";

import { getClientIp, getUserAgent } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { created, readJson, route } from "@/server/http/response";
import { setSessionCookie } from "@/server/http/session-cookie";
import { register, registerSchema } from "@/server/modules/auth";

export const POST = route(async (request: Request) => {
  const input = registerSchema.parse(await readJson(request));
  const [ip, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);
  consumeRateLimit(`register:${ip ?? "unknown"}`, RATE_LIMITS.login);
  const result = await register(input, { ip, userAgent });
  const response = created({ user: result.user });
  setSessionCookie(response as NextResponse, result.token, result.expiresAt);
  return response;
});
