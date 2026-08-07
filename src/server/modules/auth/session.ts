import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { RequestContext } from "@/server/core/context";
import { db } from "@/server/core/db";
import { logger } from "@/server/core/logger";

/**
 * Sesiones opacas persistidas en base de datos.
 *
 * Alternativa descartada: JWT autocontenido. Un JWT no se puede revocar sin
 * mantener igualmente una lista en base de datos, lo que anula su única
 * ventaja. Para un ERP donde hay que poder echar a un empleado del sistema
 * ahora mismo — y ver quién está conectado — la sesión en base de datos es
 * más simple y estrictamente más capaz.
 *
 * El token viaja en una cookie httpOnly. En la base solo vive su SHA-256: si
 * alguien obtiene una copia de la tabla, no obtiene sesiones utilizables.
 * SHA-256 basta aquí (a diferencia de las contraseñas) porque el token tiene
 * 256 bits de entropía aleatoria: no hay diccionario que atacar.
 */

/** Duración absoluta de la sesión. Una jornada de trabajo con margen. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Renovación deslizante: solo se extiende si pasó más de una hora desde la
 * última actividad, para no escribir en base de datos en cada petición.
 */
const SLIDING_REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = "erp_session";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<CreatedSession> {
  // 32 bytes = 256 bits de entropía criptográfica.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  });

  return { token, expiresAt };
}

export interface ResolvedSession {
  context: RequestContext;
  /** Nueva fecha de expiración si la sesión se renovó en esta petición. */
  refreshedExpiresAt: Date | null;
}

/**
 * Resuelve un token de cookie a un contexto de petición completo.
 *
 * Una sola consulta trae usuario, rol y permisos: es la ruta caliente que se
 * ejecuta en cada petición autenticada.
 *
 * Devuelve `null` (nunca lanza) para cualquier motivo de rechazo: token
 * ausente, inexistente, revocado, caducado, o usuario desactivado. Quien llama
 * decide si eso es un 401 o una redirección al login.
 */
export async function resolveSession(
  token: string | undefined,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResolvedSession | null> {
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          name: true,
          status: true,
          businessId: true,
          deletedAt: true,
          role: { select: { key: true, permissions: true } },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const { user } = session;
  // Un usuario desactivado o borrado pierde el acceso de inmediato, sin
  // esperar a que caduque su sesión.
  if (user.status !== "ACTIVE" || user.deletedAt) return null;

  const context: RequestContext = {
    userId: user.id,
    userName: user.name,
    businessId: user.businessId,
    roleKey: user.role.key,
    permissions: user.role.permissions,
    sessionId: session.id,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  };

  const staleness = Date.now() - session.lastSeenAt.getTime();
  if (staleness < SLIDING_REFRESH_THRESHOLD_MS) {
    return { context, refreshedExpiresAt: null };
  }

  const refreshedExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // La renovación no debe poder tumbar la petición: si falla, la sesión sigue
  // siendo válida hasta su expiración original.
  try {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: refreshedExpiresAt },
    });
    return { context, refreshedExpiresAt };
  } catch (error) {
    logger.warn("No se pudo renovar la sesión", { sessionId: session.id, error });
    return { context, refreshedExpiresAt: null };
  }
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;

  await db.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Cierra todas las sesiones de un usuario. Se usa al cambiar contraseña. */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * Purga sesiones caducadas.
 *
 * No hay cron: se invoca de forma oportunista tras cada inicio de sesión, que
 * es suficiente para que la tabla no crezca sin control en una demo, y evita
 * montar infraestructura de tareas programadas para algo tan menor.
 */
export async function pruneExpiredSessions(): Promise<void> {
  try {
    await db.session.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    });
  } catch (error) {
    logger.warn("No se pudieron purgar sesiones caducadas", { error });
  }
}

/**
 * Comparación de cadenas en tiempo constante.
 * Se usa para tokens de un solo uso donde no interviene bcrypt.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
