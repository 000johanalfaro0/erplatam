import { z } from "zod";

import { AUDIT_ACTIONS, audit } from "@/server/core/audit";
import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import { NotFoundError, ValidationError } from "@/server/core/errors";
import {
  type Page,
  buildPage,
  paginationSchema,
  toSkipTake,
} from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";
import { transaction } from "@/server/core/tx";

/**
 * MODO FEEDBACK (requisito 21)
 * ===========================================================================
 * Herramienta de comunicación entre el cliente y el equipo de desarrollo
 * durante la demo. El cliente hace clic derecho sobre cualquier zona de la
 * interfaz y deja una anotación anclada a ESE punto de ESA pantalla.
 *
 * IMPORTANTE: el sistema NO modifica la interfaz. Cuando el cliente dibuja un
 * rectángulo y escribe "quiero un botón aquí para imprimir el ticket", eso se
 * guarda como una propuesta, no se crea ningún botón. Es un cuaderno de notas
 * sobre la aplicación, no un editor.
 *
 * Por qué esto vale la pena frente a "mándame un correo con los cambios":
 * un comentario anclado a una coordenada de una pantalla concreta elimina toda
 * la ambigüedad de "el botón de arriba no se ve bien". Se sabe exactamente qué
 * botón, en qué pantalla y a qué resolución.
 */

const rectSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(0),
  height: z.number().min(0),
});

export const createFeedbackSchema = z.object({
  kind: z.enum(["COMMENT", "NEW_ELEMENT", "BUG", "IDEA"]).default("COMMENT"),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),

  title: z
    .string()
    .trim()
    .min(3, "Escribe de qué se trata")
    .max(200, "Máximo 200 caracteres"),
  description: z.string().trim().max(5000).optional().nullable(),

  /** Ruta de la pantalla donde se dejó la anotación. */
  route: z.string().trim().min(1).max(300),
  /** Etiqueta legible del elemento señalado: "Botón Cobrar". */
  elementLabel: z.string().trim().max(200).optional().nullable(),
  /** Selector o ruta del elemento, para poder reencontrarlo. */
  elementPath: z.string().trim().max(1000).optional().nullable(),

  /** Rectángulo dibujado por el cliente, en píxeles de página. */
  anchorRect: rectSchema.optional().nullable(),
  /**
   * Dimensiones de la ventana al anotar. Sin esto, un comentario sobre algo
   * "que se sale de la pantalla" es imposible de reproducir: hay que saber a
   * qué ancho ocurría.
   */
  viewportWidth: z.number().int().min(0).max(20000).optional().nullable(),
  viewportHeight: z.number().int().min(0).max(20000).optional().nullable(),

  /** Elemento propuesto: BUTTON, FIELD, TABLE, ... */
  proposedElement: z.string().trim().max(50).optional().nullable(),

  /**
   * Captura de pantalla en base64 (data URL o base64 puro).
   *
   * Se recibe como texto y no como multipart porque la genera el navegador
   * con `html-to-image`, ya en memoria. Montar un formulario multipart para
   * algo que nunca toca el disco del cliente añadiría complejidad sin ganar
   * nada.
   */
  screenshot: z.string().max(4_000_000).optional().nullable(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const updateFeedbackSchema = z.object({
  status: z
    .enum(["PENDING", "REVIEWING", "APPROVED", "IMPLEMENTED", "DISCARDED"])
    .optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  /** Notas del equipo. El cliente no las ve. */
  internalNotes: z.string().trim().max(5000).optional().nullable(),
});

export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;

export const listFeedbackSchema = paginationSchema.extend({
  status: z
    .enum(["PENDING", "REVIEWING", "APPROVED", "IMPLEMENTED", "DISCARDED"])
    .optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  kind: z.enum(["COMMENT", "NEW_ELEMENT", "BUG", "IDEA"]).optional(),
  route: z.string().trim().max(300).optional(),
  search: z.string().trim().max(100).optional(),
});

export type ListFeedbackInput = z.infer<typeof listFeedbackSchema>;

/** Tamaño máximo de captura: 3 MB de imagen ya decodificada. */
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;

const feedbackSelect = {
  id: true,
  kind: true,
  priority: true,
  status: true,
  title: true,
  description: true,
  route: true,
  elementLabel: true,
  elementPath: true,
  anchorRect: true,
  viewportWidth: true,
  viewportHeight: true,
  proposedElement: true,
  internalNotes: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  // Solo se indica SI hay captura y cuánto pesa. Los bytes se piden aparte,
  // para que listar cien anotaciones no arrastre cien imágenes.
  screenshot: { select: { id: true, sizeBytes: true, mimeType: true } },
} as const;

/**
 * Decodifica la captura y valida su tamaño.
 *
 * Acepta tanto un data URL completo (`data:image/png;base64,iVBOR...`) como
 * base64 puro, porque el navegador produce lo primero y una prueba
 * automatizada probablemente envíe lo segundo.
 */
function decodeScreenshot(input: string): {
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
} {
  const match = input.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);

  const base64 = match ? match[2] : input;
  const mimeType = match ? match[1] : "image/png";

  let data: Uint8Array<ArrayBuffer>;
  try {
    /*
     * Se copia a un Uint8Array respaldado por un ArrayBuffer propio.
     *
     * Prisma 7 tipa las columnas `Bytes` como `Uint8Array<ArrayBuffer>`. El
     * `Buffer` de Node no encaja porque desde TypeScript 5.7 `Uint8Array` es
     * genérico sobre su búfer, y el de Buffer es `ArrayBufferLike` — podría
     * ser un `SharedArrayBuffer`, que no es seguro pasar a la capa de
     * persistencia.
     *
     * `new Uint8Array(n)` sí produce un ArrayBuffer propio, y `set` copia los
     * bytes dentro.
     */
    const decoded = Buffer.from(base64, "base64");
    data = new Uint8Array(decoded.byteLength);
    data.set(decoded);
  } catch {
    throw new ValidationError("La captura de pantalla no es válida.");
  }

  if (data.length === 0) {
    throw new ValidationError("La captura de pantalla está vacía.");
  }

  if (data.length > MAX_SCREENSHOT_BYTES) {
    throw new ValidationError(
      `La captura pesa ${Math.round(data.length / 1024)} KB y el máximo es ${MAX_SCREENSHOT_BYTES / 1024} KB.`,
    );
  }

  return { data, mimeType };
}

export async function createFeedback(
  ctx: RequestContext,
  input: CreateFeedbackInput,
) {
  requirePermission(ctx, PERMISSIONS.FEEDBACK_CREATE);

  const screenshot = input.screenshot
    ? decodeScreenshot(input.screenshot)
    : null;

  return transaction(async (tx) => {
    const item = await tx.feedbackItem.create({
      data: {
        businessId: ctx.businessId,
        createdByUserId: ctx.userId,
        kind: input.kind,
        priority: input.priority,
        title: input.title,
        description: input.description ?? null,
        route: input.route,
        elementLabel: input.elementLabel ?? null,
        elementPath: input.elementPath ?? null,
        anchorRect: (input.anchorRect ?? null) as never,
        viewportWidth: input.viewportWidth ?? null,
        viewportHeight: input.viewportHeight ?? null,
        proposedElement: input.proposedElement ?? null,
        ...(screenshot
          ? {
              screenshot: {
                create: {
                  data: screenshot.data,
                  mimeType: screenshot.mimeType,
                  sizeBytes: screenshot.data.length,
                },
              },
            }
          : {}),
      },
      select: feedbackSelect,
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.FEEDBACK_CREATE,
      entityType: "FeedbackItem",
      entityId: item.id,
      after: { title: item.title, kind: item.kind, priority: item.priority },
      metadata: { pantalla: item.route, elemento: item.elementLabel },
    });

    return item;
  });
}

export async function listFeedback(
  ctx: RequestContext,
  input: ListFeedbackInput,
): Promise<Page<unknown> & { counts: Record<string, number> }> {
  requirePermission(ctx, PERMISSIONS.FEEDBACK_CREATE);

  const where = {
    businessId: ctx.businessId,
    /*
     * Sin estado pedido, se devuelve todo MENOS lo descartado.
     *
     * Antes se devolvía todo, y la capa de anotaciones —que no pide estado—
     * seguía pintando las notas descartadas. Al pulsar la papelera la nota se
     * marcaba bien en la base y se quedaba igual en pantalla, así que el
     * botón parecía roto cuando en realidad había funcionado. Descartar y
     * seguir viéndolo es la peor combinación posible: el usuario vuelve a
     * pulsar, y luego duda de si algo se guarda.
     *
     * La pantalla de feedback sí pide estado explícito, incluido DISCARDED,
     * así que su pestaña de descartadas sigue funcionando igual.
     */
    ...(input.status
      ? { status: input.status }
      : { status: { not: "DISCARDED" as const } }),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.route ? { route: input.route } : {}),
    ...(input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: "insensitive" as const } },
            {
              description: {
                contains: input.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const [items, total, grouped] = await Promise.all([
    db.feedbackItem.findMany({
      where,
      // Prioridad alta primero, y dentro de cada prioridad lo más reciente.
      // Es el orden en que se revisa el feedback de verdad.
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      ...toSkipTake(input),
      select: feedbackSelect,
    }),
    db.feedbackItem.count({ where }),
    // Conteo por estado sobre TODO el feedback, no solo el filtrado: alimenta
    // las pestañas, que deben mostrar cuántos hay en cada estado aunque estés
    // viendo uno concreto.
    db.feedbackItem.groupBy({
      by: ["status"],
      where: { businessId: ctx.businessId },
      _count: true,
    }),
  ]);

  const counts: Record<string, number> = {
    PENDING: 0,
    REVIEWING: 0,
    APPROVED: 0,
    IMPLEMENTED: 0,
    DISCARDED: 0,
  };
  for (const row of grouped) counts[row.status] = row._count;

  return { ...buildPage(items, total, input), counts };
}

export async function getFeedback(ctx: RequestContext, id: string) {
  requirePermission(ctx, PERMISSIONS.FEEDBACK_CREATE);

  const item = await db.feedbackItem.findFirst({
    where: { id, businessId: ctx.businessId },
    select: feedbackSelect,
  });

  if (!item) throw new NotFoundError("La anotación", id);
  return item;
}

/** Devuelve los bytes de la captura. Se sirve como imagen, no como JSON. */
export async function getFeedbackScreenshot(ctx: RequestContext, id: string) {
  requirePermission(ctx, PERMISSIONS.FEEDBACK_CREATE);

  const shot = await db.feedbackScreenshot.findFirst({
    where: { feedbackId: id, feedback: { businessId: ctx.businessId } },
    select: { data: true, mimeType: true },
  });

  if (!shot) throw new NotFoundError("La captura");
  return shot;
}

/**
 * Cambia estado, prioridad o notas internas.
 *
 * Requiere permiso de GESTIÓN, no solo de creación: el cliente puede dejar
 * feedback pero no marcarlo como implementado.
 */
export async function updateFeedback(
  ctx: RequestContext,
  id: string,
  input: UpdateFeedbackInput,
) {
  requirePermission(ctx, PERMISSIONS.FEEDBACK_MANAGE);

  return transaction(async (tx) => {
    const current = await tx.feedbackItem.findFirst({
      where: { id, businessId: ctx.businessId },
      select: { id: true, status: true, priority: true, title: true },
    });

    if (!current) throw new NotFoundError("La anotación", id);

    const cerrado =
      input.status === "IMPLEMENTED" || input.status === "DISCARDED";

    const item = await tx.feedbackItem.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.internalNotes !== undefined
          ? { internalNotes: input.internalNotes }
          : {}),
        ...(cerrado ? { resolvedAt: new Date() } : {}),
        // Si se reabre, se limpia la fecha de resolución.
        ...(input.status && !cerrado ? { resolvedAt: null } : {}),
      },
      select: feedbackSelect,
    });

    if (
      input.status !== undefined &&
      input.status !== current.status
    ) {
      await audit(tx, ctx, {
        action: AUDIT_ACTIONS.FEEDBACK_UPDATE,
        entityType: "FeedbackItem",
        entityId: id,
        before: { status: current.status },
        after: { status: item.status },
        metadata: { titulo: current.title },
      });
    }

    return item;
  });
}
