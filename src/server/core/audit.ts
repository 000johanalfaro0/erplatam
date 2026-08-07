import type { AuditAction } from "./audit-actions";
import type { RequestContext } from "./context";
import { db } from "./db";
import { logger } from "./logger";
import type { Tx } from "./tx";

/**
 * Bitácora de auditoría (requisito 14).
 *
 * Decisión clave: el registro se escribe DENTRO de la misma transacción que la
 * operación auditada. Consecuencias, ambas deseadas:
 *
 *   - Si la operación revierte, su registro de auditoría también. No queda
 *     constancia de ventas que nunca existieron.
 *   - Si la auditoría falla, la operación revierte. Una operación crítica sin
 *     rastro es peor que una operación que no ocurrió.
 *
 * Para eventos NO críticos (inicios de sesión, consultas) existe
 * `auditDetached`, que no bloquea ni tumba la operación si falla.
 */

/**
 * Verbos de la bitácora.
 *
 * Se re-exportan desde `audit-actions.ts`, que es un módulo PURO sin ninguna
 * dependencia. La interfaz necesita estas constantes para traducirlas a
 * español, y si las importara desde aquí arrastraría consigo el cliente de
 * base de datos al bundle del navegador — que fue exactamente el fallo que
 * tumbaba la pantalla de auditoría con un 500.
 */
export { AUDIT_ACTIONS, type AuditAction } from "./audit-actions";

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Estado anterior. Solo campos relevantes; nunca secretos. */
  before?: unknown;
  /** Estado posterior. */
  after?: unknown;
  /** Contexto extra: folio, motivo, importe. */
  metadata?: Record<string, unknown>;
}

/** Claves que nunca deben acabar en la bitácora. */
const FORBIDDEN_KEYS = new Set([
  "password",
  "passwordHash",
  "tokenHash",
  "sessionToken",
  "secret",
]);

/**
 * Poda el objeto antes de persistirlo: quita secretos y recorta profundidad.
 * La bitácora debe ser legible por un humano en una revisión, no un volcado.
 */
function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > 4) return "[…]";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    // Un ticket con 200 líneas no debe inflar la bitácora.
    const limited = value.slice(0, 50).map((item) => sanitize(item, depth + 1));
    if (value.length > 50) limited.push(`[+${value.length - 50} más]`);
    return limited;
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    output[key] = sanitize(val, depth + 1);
  }
  return output;
}

/**
 * Escribe en la bitácora dentro de una transacción existente.
 * Úsalo para toda operación crítica.
 */
export async function audit(
  tx: Tx,
  ctx: RequestContext,
  input: AuditInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      businessId: ctx.businessId,
      userId: ctx.userId,
      userName: ctx.userName,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: sanitize(input.before) as never,
      after: sanitize(input.after) as never,
      metadata: sanitize(input.metadata) as never,
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 500) ?? null,
    },
  });
}

/**
 * Escribe en la bitácora fuera de transacción, sin propagar fallos.
 *
 * Reservado a eventos donde perder el registro es aceptable y tumbar la
 * operación no lo es: inicio de sesión, intento fallido de acceso. Un fallo al
 * auditar un login no debe impedir que el cajero entre a cobrar.
 */
export async function auditDetached(
  businessId: string,
  input: AuditInput & {
    userId?: string | null;
    userName?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        businessId,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: sanitize(input.before) as never,
        after: sanitize(input.after) as never,
        metadata: sanitize(input.metadata) as never,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    logger.error("No se pudo escribir el registro de auditoría", error, {
      action: input.action,
      entityType: input.entityType,
    });
  }
}
