import { z } from "zod";

import { requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import { buildPage, paginationSchema, toSkipTake } from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";
import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, route } from "@/server/http/response";

/**
 * GET /api/v1/audit — visor de la bitácora (requisito 14).
 *
 * Solo lectura. La bitácora no tiene endpoints de escritura ni de borrado a
 * propósito: se escribe únicamente desde dentro de las transacciones que
 * audita. Exponer un POST permitiría fabricar entradas falsas, y un DELETE
 * anularía todo su propósito.
 */
const querySchema = paginationSchema.extend({
  userId: z.uuid().optional(),
  action: z.string().trim().max(50).optional(),
  entityType: z.string().trim().max(50).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  search: z.string().trim().max(100).optional(),
});

export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  requirePermission(ctx, PERMISSIONS.AUDIT_READ);
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const input = querySchema.parse(params);

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
    // Para poblar los filtros con lo que realmente existe, en lugar de con
    // una lista fija que puede no corresponder a este negocio.
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

  return ok({
    ...buildPage(items, total, input),
    filtros: {
      usuarios,
      acciones: acciones.map((row) => ({
        action: row.action,
        count: row._count,
      })),
    },
  });
});
