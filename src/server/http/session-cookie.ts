import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { isProduction } from "@/server/core/env";
import { SESSION_COOKIE_NAME } from "@/server/modules/auth";

/**
 * Manejo de la cookie de sesión.
 *
 * Atributos y su motivo concreto:
 *
 *   httpOnly : JavaScript no puede leerla. Si alguien logra inyectar un script
 *              en la página, aun así no puede robar la sesión.
 *   sameSite : "lax". El navegador no envía la cookie en peticiones
 *              cross-site de escritura, que es exactamente el vector CSRF.
 *              "strict" rompería llegar a la app desde un enlace externo ya
 *              autenticado, sin ganancia real sobre "lax" para este caso.
 *   secure   : solo HTTPS en producción. En local se desactiva porque si no,
 *              el navegador descartaría la cookie en http://localhost.
 *   path "/" : la sesión aplica a toda la aplicación.
 *
 * No se fija `domain` a propósito: sin él, la cookie queda restringida al host
 * exacto y no se comparte con subdominios.
 */

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  expires: Date;
}

export function sessionCookieOptions(expiresAt: Date): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  };
}

/** Lee el token de la cookie en un Server Component o Route Handler. */
export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

/** Escribe la cookie de sesión en una respuesta de Route Handler. */
export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(expiresAt),
  );
}

/** Borra la cookie de sesión. */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
