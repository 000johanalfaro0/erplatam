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

/** Verbos en formato `recurso.acción`. Lista cerrada para poder filtrar. */
export const AUDIT_ACTIONS = {
  AUTH_LOGIN: "auth.login",
  AUTH_LOGIN_FAILED: "auth.login_failed",
  AUTH_LOGOUT: "auth.logout",

  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",

  CATEGORY_CREATE: "category.create",
  CATEGORY_UPDATE: "category.update",
  CATEGORY_DELETE: "category.delete",

  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_UPDATE: "customer.update",
  CUSTOMER_DELETE: "customer.delete",

  SUPPLIER_CREATE: "supplier.create",
  SUPPLIER_UPDATE: "supplier.update",
  SUPPLIER_DELETE: "supplier.delete",

  SALE_CREATE: "sale.create",
  SALE_VOID: "sale.void",

  PURCHASE_CREATE: "purchase.create",
  PURCHASE_VOID: "purchase.void",

  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_ENTRY: "inventory.entry",
  INVENTORY_EXIT: "inventory.exit",

  EXPENSE_CREATE: "expense.create",
  EXPENSE_UPDATE: "expense.update",
  EXPENSE_DELETE: "expense.delete",

  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_DEACTIVATE: "user.deactivate",

  SETTINGS_UPDATE: "settings.update",

  FEEDBACK_CREATE: "feedback.create",
  FEEDBACK_UPDATE: "feedback.update",

  DISCOVERY_SUBMIT: "discovery.submit",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

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
