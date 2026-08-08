import { headers } from "next/headers";

import type { RequestContext } from "@/server/core/context";
import { UnauthenticatedError } from "@/server/core/errors";
import { resolveSession } from "@/server/modules/auth";

import { contextoAccesoLibre } from "./acceso-libre";
import { readSessionToken } from "./session-cookie";

/**
 * Obtención del contexto autenticado desde una petición de Next.js.
 *
 * Es el único punto del sistema donde se traduce "una petición HTTP" a "quién
 * está actuando". A partir de aquí, todo el dominio trabaja con
 * `RequestContext` y no sabe que existe HTTP.
 */

/**
 * Extrae la IP del cliente.
 *
 * Detrás del proxy de Vercel, `x-forwarded-for` trae la cadena completa de
 * saltos. El primer elemento es el cliente original.
 *
 * Advertencia consciente: esta cabecera es falsificable si la aplicación se
 * expone sin un proxy de confianza delante. Por eso la IP se usa solo para
 * la bitácora y para limitación de peticiones best-effort, nunca como factor
 * de autorización.
 */
export async function getClientIp(): Promise<string | null> {
  const headerList = await headers();

  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 45); // Cabe una IPv6 completa
  }

  return headerList.get("x-real-ip")?.slice(0, 45) ?? null;
}

export async function getUserAgent(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get("user-agent")?.slice(0, 500) ?? null;
}

/**
 * Devuelve el contexto autenticado, o `null` si no hay sesión válida.
 * Úsalo cuando la ruta funciona con y sin sesión.
 */
export async function getOptionalContext(): Promise<RequestContext | null> {
  const token = await readSessionToken();
  const [ip, userAgent] = await Promise.all([getClientIp(), getUserAgent()]);

  if (token) {
    const resolved = await resolveSession(token, { ip, userAgent });
    if (resolved) return resolved.context;
  }

  // Puerta abierta para enseñar la demo. Solo existe si `DEMO_ACCESO_LIBRE`
  // está puesta; ver `acceso-libre.ts`. Va DESPUÉS de la sesión real para
  // que quien sí haya entrado con sus credenciales siga siendo él mismo, y
  // no lo degrademos al usuario invitado.
  return contextoAccesoLibre(ip, userAgent);
}

/**
 * Devuelve el contexto autenticado o lanza 401.
 * Es la forma por defecto de proteger un endpoint.
 */
export async function requireContext(): Promise<RequestContext> {
  const context = await getOptionalContext();
  if (!context) throw new UnauthenticatedError();
  return context;
}
