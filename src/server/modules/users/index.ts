import { z } from "zod";

import { AUDIT_ACTIONS, audit } from "@/server/core/audit";
import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/core/errors";
import { PERMISSIONS } from "@/server/core/permissions";
import { transaction } from "@/server/core/tx";
import {
  hashPassword,
  passwordSchema,
  revokeAllUserSessions,
} from "@/server/modules/auth";

/**
 * USUARIOS Y ROLES
 * ===========================================================================
 * Alta, edición, cambio de rol y desactivación del personal.
 *
 * LAS CUATRO REGLAS QUE PROTEGEN AL NEGOCIO DE SÍ MISMO
 *
 * 1. NADIE SE DESACTIVA A SÍ MISMO. Ni se cambia el rol a sí mismo. Es la
 *    forma más rápida y más tonta de quedarse fuera del propio sistema un
 *    domingo por la tarde.
 *
 * 2. SIEMPRE QUEDA UN ADMINISTRADOR ACTIVO. Se comprueba antes de desactivar
 *    y antes de degradar de rol. Un negocio sin nadie que pueda tocar la
 *    configuración es un negocio que necesita soporte técnico para algo que
 *    debería resolver solo.
 *
 * 3. LOS USUARIOS NO SE BORRAN. Sus ventas, movimientos de inventario y
 *    registros de auditoría los referencian; borrarlos dejaría el historial
 *    sin autor. Se desactivan: dejan de poder entrar, pero todo lo que
 *    hicieron sigue teniendo nombre.
 *
 * 4. DESACTIVAR CIERRA LA SESIÓN AL INSTANTE. Marcar `INACTIVE` sin revocar
 *    sesiones deja a la persona dentro hasta que caduque su cookie —horas—.
 *    Que las sesiones vivan en base de datos y no en un JWT autocontenido es
 *    justo lo que permite que esto sea inmediato.
 *
 * SOBRE LA CONTRASEÑA INICIAL: la pone quien crea el usuario y se le entrega
 * a la persona. No hay correo de invitación porque no hay servidor de correo,
 * y fingir que lo hay sería peor que no tenerlo.
 */

const ROL_ADMIN = "ADMIN";

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre es demasiado corto")
    .max(120, "Máximo 120 caracteres"),
  email: z
    .email("Ese correo no parece válido")
    .trim()
    .toLowerCase()
    .max(200),
  password: passwordSchema,
  roleId: z.uuid("Elige un rol"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  roleId: z.uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  /** Restablecer contraseña. Solo con permiso de escritura sobre usuarios. */
  password: passwordSchema.optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

const userSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  role: { select: { id: true, key: true, name: true } },
} as const;

export async function listUsers(ctx: RequestContext) {
  requirePermission(ctx, PERMISSIONS.USERS_READ);

  return db.user.findMany({
    where: { businessId: ctx.businessId, deletedAt: null },
    select: userSelect,
    // Activos primero: es la lista que se consulta a diario. Los
    // desactivados interesan una vez al año.
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

/** Roles disponibles para asignar. */
export async function listRoles(ctx: RequestContext) {
  requirePermission(ctx, PERMISSIONS.USERS_READ);

  return db.role.findMany({
    where: { businessId: ctx.businessId },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      permissions: true,
      _count: { select: { users: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Cuántos administradores activos quedarían excluyendo a uno. */
async function administradoresActivosSalvo(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  businessId: string,
  exceptoUserId: string,
): Promise<number> {
  return tx.user.count({
    where: {
      businessId,
      deletedAt: null,
      status: "ACTIVE",
      id: { not: exceptoUserId },
      role: { key: ROL_ADMIN },
    },
  });
}

export async function createUser(ctx: RequestContext, input: CreateUserInput) {
  requirePermission(ctx, PERMISSIONS.USERS_WRITE);

  const rol = await db.role.findFirst({
    where: { id: input.roleId, businessId: ctx.businessId },
    select: { id: true, key: true, name: true },
  });

  if (!rol) throw new ValidationError("El rol seleccionado no existe.");

  // El hash tarda ~250 ms; fuera de la transacción para no retener conexión.
  const passwordHash = await hashPassword(input.password);

  return transaction(async (tx) => {
    const repetido = await tx.user.findFirst({
      where: { businessId: ctx.businessId, email: input.email },
      select: { id: true, deletedAt: true },
    });

    if (repetido) {
      throw new ConflictError(
        repetido.deletedAt
          ? "Ese correo pertenece a un usuario eliminado. Contacta con soporte para recuperarlo."
          : "Ya hay alguien con ese correo.",
      );
    }

    const user = await tx.user.create({
      data: {
        businessId: ctx.businessId,
        name: input.name,
        email: input.email,
        passwordHash,
        roleId: rol.id,
      },
      select: userSelect,
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.USER_CREATE,
      entityType: "User",
      entityId: user.id,
      // Nunca el hash, ni siquiera en auditoría: quien lee la bitácora no
      // necesita —ni debe— ver material derivado de la contraseña.
      after: { name: user.name, email: user.email, rol: rol.name },
    });

    return user;
  });
}

export async function updateUser(
  ctx: RequestContext,
  id: string,
  input: UpdateUserInput,
) {
  requirePermission(ctx, PERMISSIONS.USERS_WRITE);

  const esUnoMismo = id === ctx.userId;

  if (esUnoMismo && input.status === "INACTIVE") {
    throw new ValidationError(
      "No puedes desactivar tu propia cuenta. Pídeselo a otro administrador.",
    );
  }

  if (esUnoMismo && input.roleId) {
    throw new ValidationError(
      "No puedes cambiarte el rol a ti mismo. Pídeselo a otro administrador.",
    );
  }

  const passwordHash = input.password
    ? await hashPassword(input.password)
    : undefined;

  const resultado = await transaction(async (tx) => {
    const antes = await tx.user.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
      select: userSelect,
    });

    if (!antes) throw new NotFoundError("El usuario", id);

    // ¿Deja al negocio sin administradores? Aplica tanto al desactivar como
    // al degradar de rol; se comprueban las dos puertas juntas.
    const dejaDeSerAdmin =
      antes.role.key === ROL_ADMIN &&
      ((input.status === "INACTIVE" && antes.status === "ACTIVE") ||
        (input.roleId !== undefined && input.roleId !== antes.role.id));

    if (dejaDeSerAdmin) {
      const restantes = await administradoresActivosSalvo(
        tx,
        ctx.businessId,
        id,
      );

      if (restantes === 0) {
        throw new ValidationError(
          "Es el único administrador activo. Nombra otro administrador antes de cambiar este.",
        );
      }
    }

    let rolNuevo: { id: string; name: string } | null = null;
    if (input.roleId && input.roleId !== antes.role.id) {
      rolNuevo = await tx.role.findFirst({
        where: { id: input.roleId, businessId: ctx.businessId },
        select: { id: true, name: true },
      });

      if (!rolNuevo) throw new ValidationError("El rol seleccionado no existe.");
    }

    const user = await tx.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        // Restablecer la contraseña o reactivar también levanta el bloqueo
        // por intentos fallidos: si no, la persona seguiría sin poder entrar
        // con su contraseña nueva y nadie entendería por qué.
        ...(passwordHash || input.status === "ACTIVE"
          ? { failedAttempts: 0, lockedUntil: null }
          : {}),
      },
      select: userSelect,
    });

    await audit(tx, ctx, {
      action:
        input.status === "INACTIVE"
          ? AUDIT_ACTIONS.USER_DEACTIVATE
          : AUDIT_ACTIONS.USER_UPDATE,
      entityType: "User",
      entityId: id,
      before: { name: antes.name, rol: antes.role.name, estado: antes.status },
      after: { name: user.name, rol: user.role.name, estado: user.status },
      metadata: {
        ...(passwordHash ? { contrasenaRestablecida: true } : {}),
        ...(rolNuevo ? { rolNuevo: rolNuevo.name } : {}),
      },
    });

    return {
      user,
      // Desactivar, cambiar de rol o restablecer la contraseña invalidan lo
      // que la sesión abierta tiene cacheado. Se revoca fuera de la
      // transacción para no alargar el bloqueo de fila.
      revocarSesiones: Boolean(
        input.status === "INACTIVE" || rolNuevo || passwordHash,
      ),
    };
  });

  if (resultado.revocarSesiones) {
    await revokeAllUserSessions(id);
  }

  return resultado.user;
}
