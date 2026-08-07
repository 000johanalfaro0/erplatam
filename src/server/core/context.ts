import { ForbiddenError } from "./errors";
import { hasPermission } from "./permissions";

/**
 * Contexto de una operación autenticada.
 *
 * TODO servicio de dominio recibe este objeto como primer argumento. Es la
 * única vía por la que la lógica de negocio conoce quién actúa y sobre qué
 * negocio, lo que elimina de raíz dos clases de bug:
 *
 *   1. Olvidar filtrar por `businessId` y filtrar datos de otro tenant.
 *   2. Olvidar registrar quién hizo la operación en la auditoría.
 *
 * No contiene objetos de Next.js ni de HTTP: el dominio permanece agnóstico
 * del transporte.
 */
export interface RequestContext {
  readonly userId: string;
  readonly userName: string;
  readonly businessId: string;
  readonly roleKey: string;
  readonly permissions: readonly string[];
  readonly sessionId: string;
  /** Metadatos para la bitácora de auditoría. */
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/**
 * Autoriza o lanza. Se invoca al inicio de cada método de servicio que
 * modifica datos.
 *
 * La comprobación vive en el servicio, no en la ruta HTTP: así una operación
 * sigue protegida aunque mañana se invoque desde un job, un script o una
 * cola, y no solo desde una petición web.
 */
export function requirePermission(
  ctx: RequestContext,
  permission: string,
): void {
  if (!hasPermission(ctx.permissions, permission)) {
    throw new ForbiddenError(permission);
  }
}

export function can(ctx: RequestContext, permission: string): boolean {
  return hasPermission(ctx.permissions, permission);
}
