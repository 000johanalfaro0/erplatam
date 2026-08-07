import { z } from "zod";

import { AUDIT_ACTIONS, audit } from "@/server/core/audit";
import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import { PERMISSIONS } from "@/server/core/permissions";
import { transaction } from "@/server/core/tx";

/**
 * Módulo del cuestionario de descubrimiento (requisito 19).
 *
 * DECISIÓN DE ESQUEMA: las respuestas se guardan como un único objeto JSON,
 * no como una columna por pregunta.
 *
 * Motivo: el cuestionario va a cambiar. Añadir "¿usas báscula?" no debería
 * requerir una migración de base de datos, y quitar una pregunta no debería
 * invalidar las respuestas ya recogidas. El JSON versionado permite ambas
 * cosas: cada respuesta conserva `formVersion`, así que siempre se sabe con
 * qué formulario se capturó.
 *
 * El coste es no poder consultar por respuesta con SQL indexado. Es
 * aceptable: habrá una decena de respuestas en total, no un millón, y se leen
 * enteras.
 */

/**
 * Las respuestas se validan como objeto abierto de tipos primitivos.
 *
 * No se genera un esquema Zod estricto a partir de las preguntas a propósito:
 * eso ataría el servidor a la versión del formulario que conoce el cliente, y
 * un cliente con una versión antigua abierta en otra pestaña fallaría al
 * enviar. La validación fina (qué preguntas son obligatorias) ocurre en la
 * interfaz, donde el usuario puede corregir; aquí solo se comprueba la forma.
 */
const answerValueSchema = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
  z.null(),
]);

export const saveDiscoverySchema = z.object({
  formVersion: z.number().int().min(1),
  answers: z.record(z.string().max(100), answerValueSchema),
  /** Si el cliente lo dio por terminado o lo está guardando a medias. */
  completed: z.boolean().default(false),
});

export type SaveDiscoveryInput = z.infer<typeof saveDiscoverySchema>;

const select = {
  id: true,
  formVersion: true,
  answers: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Guarda o actualiza las respuestas.
 *
 * Hay UNA respuesta por negocio y versión de formulario: se sobrescribe en
 * lugar de acumular. El cuestionario se contesta a lo largo de varios días y
 * a ratos, así que crear una fila nueva en cada guardado dejaría un rastro de
 * borradores que nadie querría revisar.
 */
export async function saveDiscovery(
  ctx: RequestContext,
  input: SaveDiscoveryInput,
) {
  requirePermission(ctx, PERMISSIONS.DISCOVERY_WRITE);

  return transaction(async (tx) => {
    const existing = await tx.discoveryResponse.findFirst({
      where: { businessId: ctx.businessId, formVersion: input.formVersion },
      select: { id: true, completedAt: true },
    });

    const data = {
      answers: input.answers as never,
      // Una vez completado, no se "descompleta" por guardar de nuevo: el
      // cliente puede seguir refinando respuestas después de terminar.
      completedAt: input.completed
        ? (existing?.completedAt ?? new Date())
        : (existing?.completedAt ?? null),
    };

    const response = existing
      ? await tx.discoveryResponse.update({
          where: { id: existing.id },
          data,
          select,
        })
      : await tx.discoveryResponse.create({
          data: {
            businessId: ctx.businessId,
            formVersion: input.formVersion,
            ...data,
          },
          select,
        });

    // Solo se audita al completar, no en cada guardado automático: la
    // bitácora quedaría inservible con cien entradas de "guardó un borrador".
    if (input.completed && !existing?.completedAt) {
      await audit(tx, ctx, {
        action: AUDIT_ACTIONS.DISCOVERY_SUBMIT,
        entityType: "DiscoveryResponse",
        entityId: response.id,
        metadata: {
          version: input.formVersion,
          respondidas: Object.keys(input.answers).length,
        },
      });
    }

    return response;
  });
}

/** Respuestas guardadas del negocio, si las hay. */
export async function getDiscovery(ctx: RequestContext, formVersion: number) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_READ);

  return db.discoveryResponse.findFirst({
    where: { businessId: ctx.businessId, formVersion },
    select,
  });
}
