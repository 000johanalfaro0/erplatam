import { AUDIT_ACTIONS, auditDetached } from "@/server/core/audit";
import type { RequestContext } from "@/server/core/context";
import { db } from "@/server/core/db";
import {
  BusinessRuleError,
  InvalidCredentialsError,
  RateLimitError,
  UnauthenticatedError,
  ValidationError,
} from "@/server/core/errors";
import { logger } from "@/server/core/logger";

import { hashPassword, verifyPassword, wastePasswordTime } from "./password";
import type { ChangePasswordInput, LoginInput } from "./schema";
import {
  type CreatedSession,
  createSession,
  pruneExpiredSessions,
  revokeAllUserSessions,
  revokeSession,
} from "./session";

/**
 * PROTECCIÓN CONTRA FUERZA BRUTA
 * ---------------------------------------------------------------------------
 * Bloqueo por cuenta, persistido en base de datos.
 *
 * Se eligió bloqueo por cuenta y no solo por IP porque en un negocio todas las
 * cajas comparten la misma IP pública: limitar por IP castigaría a los
 * empleados legítimos mientras un atacante rota direcciones. El límite por IP
 * existe además, pero en la capa HTTP y con un umbral mucho más alto.
 *
 * El bloqueo es temporal y escalonado, no permanente: un bloqueo permanente
 * convierte un ataque en una denegación de servicio contra el negocio.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATIONS_MS = [
  1 * 60 * 1000, // 6.º fallo  ->  1 minuto
  5 * 60 * 1000, // 7.º fallo  ->  5 minutos
  15 * 60 * 1000, // 8.º y siguientes -> 15 minutos
];

function lockDurationFor(failedAttempts: number): number {
  const index = Math.min(
    failedAttempts - MAX_FAILED_ATTEMPTS,
    LOCK_DURATIONS_MS.length - 1,
  );
  return LOCK_DURATIONS_MS[Math.max(index, 0)];
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    roleKey: string;
    permissions: string[];
    businessId: string;
    businessName: string;
  };
}

/**
 * Inicia sesión.
 *
 * Regla de oro: ante cualquier fallo se devuelve SIEMPRE el mismo mensaje
 * ("Correo o contraseña incorrectos") y se consume el mismo tiempo. Distinguir
 * "ese correo no existe" de "esa contraseña no es" permitiría enumerar las
 * cuentas del sistema.
 */
export async function login(
  input: LoginInput,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<LoginResult> {
  // Un único constructor de fallo para todos los caminos de error: así es
  // imposible que alguno acabe devolviendo un mensaje más específico por
  // descuido y permita enumerar cuentas.
  const genericFailure = () => new InvalidCredentialsError();

  const user = await db.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      status: true,
      failedAttempts: true,
      lockedUntil: true,
      businessId: true,
      business: { select: { name: true } },
      role: { select: { key: true, permissions: true } },
    },
  });

  if (!user) {
    // Se gasta el mismo tiempo que una verificación real.
    await wastePasswordTime(input.password);
    throw genericFailure();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const seconds = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 1000,
    );
    await auditDetached(user.businessId, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: "cuenta_bloqueada", email: user.email },
    });
    throw new RateLimitError(
      seconds,
      `Cuenta bloqueada temporalmente por intentos fallidos. Espera ${seconds} segundos.`,
    );
  }

  const passwordOk = await verifyPassword(input.password, user.passwordHash);

  if (!passwordOk) {
    const failedAttempts = user.failedAttempts + 1;
    const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;

    await db.user.update({
      where: { id: user.id },
      data: {
        failedAttempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + lockDurationFor(failedAttempts))
          : null,
      },
    });

    await auditDetached(user.businessId, {
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: "contrasena_incorrecta", failedAttempts },
    });

    throw genericFailure();
  }

  // Un usuario desactivado recibe el mismo mensaje genérico: que su cuenta
  // exista no es información que deba confirmarse a quien prueba credenciales.
  if (user.status !== "ACTIVE") {
    throw genericFailure();
  }

  const [session] = await Promise.all([
    createSession(user.id, meta),
    db.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),
  ]);

  await auditDetached(user.businessId, {
    action: AUDIT_ACTIONS.AUTH_LOGIN,
    entityType: "User",
    entityId: user.id,
    userId: user.id,
    userName: user.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  // Mantenimiento oportunista, sin bloquear la respuesta.
  void pruneExpiredSessions();

  logger.info("Inicio de sesión", { userId: user.id, role: user.role.key });

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roleKey: user.role.key,
      permissions: user.role.permissions,
      businessId: user.businessId,
      businessName: user.business.name,
    },
  };
}

export async function logout(
  token: string | undefined,
  ctx: RequestContext | null,
): Promise<void> {
  await revokeSession(token);

  if (ctx) {
    await auditDetached(ctx.businessId, {
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      entityType: "User",
      entityId: ctx.userId,
      userId: ctx.userId,
      userName: ctx.userName,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }
}

/**
 * Cambia la contraseña del usuario autenticado.
 *
 * Cierra todas sus demás sesiones: si el motivo del cambio es que alguien más
 * conocía la contraseña, dejar viva la sesión de esa persona haría inútil el
 * cambio.
 */
export async function changePassword(
  ctx: RequestContext,
  input: ChangePasswordInput,
): Promise<CreatedSession> {
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, passwordHash: true, name: true },
  });

  if (!user) throw new UnauthenticatedError("Usuario inexistente");

  const currentOk = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!currentOk) {
    throw new ValidationError("La contraseña actual no es correcta.", {
      field: "currentPassword",
    });
  }

  const newHash = await hashPassword(input.newPassword);

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  // Se revocan TODAS las sesiones, incluida la actual. Si el motivo del cambio
  // es que alguien más conocía la contraseña, dejar viva su sesión haría
  // inútil el cambio.
  await revokeAllUserSessions(user.id);

  await auditDetached(ctx.businessId, {
    action: AUDIT_ACTIONS.USER_UPDATE,
    entityType: "User",
    entityId: user.id,
    userId: ctx.userId,
    userName: ctx.userName,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { change: "password" },
  });

  // Se emite una sesión nueva para quien acaba de actuar correctamente: no
  // tiene sentido expulsarlo de la aplicación por haber hecho lo correcto.
  return createSession(user.id, { ip: ctx.ip, userAgent: ctx.userAgent });
}

/** Datos del usuario autenticado para la interfaz. */
export async function getCurrentUser(ctx: RequestContext) {
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      name: true,
      email: true,
      lastLoginAt: true,
      role: { select: { key: true, name: true, permissions: true } },
      business: {
        select: {
          id: true,
          name: true,
          settings: {
            select: {
              currency: true,
              locale: true,
              timezone: true,
              defaultTaxRateBps: true,
              pricesIncludeTax: true,
              allowNegativeStock: true,
              lowStockThreshold: true,
            },
          },
        },
      },
    },
  });

  if (!user) throw new UnauthenticatedError("Usuario inexistente");
  if (!user.business.settings) {
    throw new BusinessRuleError(
      "La configuración del negocio no está inicializada. Ejecuta el seed.",
    );
  }

  return user;
}
