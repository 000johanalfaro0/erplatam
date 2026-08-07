import { z } from "zod";

import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import { buildPage, paginationSchema, toSkipTake } from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";

/**
 * Consulta de la bitácora de auditoría.
 *
 * SOLO LECTURA, sin excepciones. Este módulo no expone ninguna función que
 * escriba ni que borre: la bitácora se escribe únicamente desde dentro de las
 * transacciones que audita, vía `core/audit.ts`.
 *
 * Estaba en el route handler y se extrae aquí porque ahora lo llaman DOS
 * caminos: el endpoint HTTP y la página, que lo resuelve en el servidor para
 * evitar un segundo viaje.
 */

export const listAuditSchema = paginationSchema.extend({
  userId: z.uuid().optional(),
  action: z.string().trim().max(50).optional(),
  entityType: z.string().trim().max(50).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  search: z.string().trim().max(100).optional(),
});

export type ListAuditInput = z.infer<typeof listAuditSchema>;

export async function listAudit(ctx: RequestContext, input: ListAuditInput) {
  requirePermission(ctx, PERMISSIONS.AUDIT_READ);

  const where = {
    businessId: ctx.businessId,
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.action ? { action: input.action } : {}),
    ...(input.entityType ? { entityType: input.entityType } : {}),
    ...(input.search
      ? { userName: { contains: input.search, mode: "insensitive" as const } }
      : {}),
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          },
        }
      : {}),
  };

  const [items, total, usuarios, acciones] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(input),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        userName: true,
        before: true,
        after: true,
        metadata: true,
        ip: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
    db.auditLog.count({ where }),
    // Los filtros se pueblan con lo que realmente existe en este negocio, no
    // con una lista fija que podría no corresponder.
    db.user.findMany({
      where: { businessId: ctx.businessId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.auditLog.groupBy({
      by: ["action"],
      where: { businessId: ctx.businessId },
      _count: true,
      orderBy: { action: "asc" },
    }),
  ]);

  return {
    ...buildPage(items, total, input),
    filtros: {
      usuarios,
      acciones: acciones.map((row) => ({
        action: row.action,
        count: row._count,
      })),
    },
  };
}
