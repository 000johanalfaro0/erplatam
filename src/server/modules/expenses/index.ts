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
 * GASTOS (requisito 8)
 * ===========================================================================
 * El módulo más simple del sistema, y a propósito: un gasto es una salida de
 * dinero con categoría, importe y fecha. No hay inventario, ni impuestos que
 * descomponer, ni transacciones complejas.
 *
 * Lo que sí importa: los gastos alimentan la ganancia estimada del panel y los
 * reportes. Sin ellos, el negocio ve ingresos y cree que son utilidad.
 *
 * `spentAt` se separa de `createdAt` porque la captura casi siempre es
 * posterior al gasto real: el recibo de la luz se paga el martes y se captura
 * el viernes. Sin esa distinción, los reportes mensuales saldrían mal cada vez
 * que un gasto se capture a caballo entre dos meses.
 */

export const createExpenseSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Describe el gasto")
    .max(300, "Máximo 300 caracteres"),
  amountCents: z
    .number()
    .int("El importe debe estar en centavos")
    .min(1, "El importe debe ser mayor que cero")
    .max(2_147_483_647, "El importe es demasiado grande"),
  categoryId: z.uuid().optional().nullable(),
  paymentMethodId: z.uuid().optional().nullable(),
  /** Fecha real del gasto. Puede ser retroactiva. */
  spentAt: z.iso.datetime().optional(),
  /** Folio del recibo o referencia de la transferencia. */
  reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial();
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const listExpensesSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  categoryId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sortBy: z.enum(["spentAt", "amountCents"]).default("spentAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListExpensesInput = z.infer<typeof listExpensesSchema>;

const expenseSelect = {
  id: true,
  description: true,
  amountCents: true,
  spentAt: true,
  reference: true,
  notes: true,
  createdAt: true,
  category: { select: { id: true, name: true, color: true } },
  method: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, name: true } },
} as const;

/** Verifica que categoría y método de pago sean del MISMO negocio. */
async function assertReferences(
  businessId: string,
  input: { categoryId?: string | null; paymentMethodId?: string | null },
) {
  if (input.categoryId) {
    const category = await db.expenseCategory.findFirst({
      where: { id: input.categoryId, businessId, deletedAt: null },
      select: { id: true },
    });
    if (!category) {
      throw new ValidationError("La categoría seleccionada no existe.");
    }
  }

  if (input.paymentMethodId) {
    const method = await db.paymentMethod.findFirst({
      where: { id: input.paymentMethodId, businessId, isActive: true },
      select: { id: true },
    });
    if (!method) {
      throw new ValidationError("El método de pago seleccionado no existe.");
    }
  }
}

export async function createExpense(
  ctx: RequestContext,
  input: CreateExpenseInput,
) {
  requirePermission(ctx, PERMISSIONS.EXPENSES_WRITE);

  await assertReferences(ctx.businessId, input);

  return transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        description: input.description,
        amountCents: input.amountCents,
        categoryId: input.categoryId ?? null,
        paymentMethodId: input.paymentMethodId ?? null,
        spentAt: input.spentAt ? new Date(input.spentAt) : new Date(),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      },
      select: expenseSelect,
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.EXPENSE_CREATE,
      entityType: "Expense",
      entityId: expense.id,
      after: {
        description: expense.description,
        amountCents: expense.amountCents,
        spentAt: expense.spentAt,
      },
      metadata: { categoria: expense.category?.name },
    });

    return expense;
  });
}

export async function updateExpense(
  ctx: RequestContext,
  id: string,
  input: UpdateExpenseInput,
) {
  requirePermission(ctx, PERMISSIONS.EXPENSES_WRITE);

  await assertReferences(ctx.businessId, input);

  return transaction(async (tx) => {
    const current = await tx.expense.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
      select: expenseSelect,
    });

    if (!current) throw new NotFoundError("El gasto", id);

    const expense = await tx.expense.update({
      where: { id },
      data: {
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.amountCents !== undefined
          ? { amountCents: input.amountCents }
          : {}),
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
        ...(input.paymentMethodId !== undefined
          ? { paymentMethodId: input.paymentMethodId }
          : {}),
        ...(input.spentAt !== undefined
          ? { spentAt: new Date(input.spentAt) }
          : {}),
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      select: expenseSelect,
    });

    // El importe es el campo que más importa auditar: cambiarlo altera la
    // utilidad reportada del mes.
    if (
      current.amountCents !== expense.amountCents ||
      current.description !== expense.description
    ) {
      await audit(tx, ctx, {
        action: AUDIT_ACTIONS.EXPENSE_UPDATE,
        entityType: "Expense",
        entityId: id,
        before: {
          description: current.description,
          amountCents: current.amountCents,
        },
        after: {
          description: expense.description,
          amountCents: expense.amountCents,
        },
      });
    }

    return expense;
  });
}

/** Borrado lógico: un gasto eliminado deja de contar pero queda su rastro. */
export async function deleteExpense(ctx: RequestContext, id: string) {
  requirePermission(ctx, PERMISSIONS.EXPENSES_WRITE);

  return transaction(async (tx) => {
    const current = await tx.expense.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
      select: { id: true, description: true, amountCents: true },
    });

    if (!current) throw new NotFoundError("El gasto", id);

    const deleted = await tx.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, description: true },
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.EXPENSE_DELETE,
      entityType: "Expense",
      entityId: id,
      before: {
        description: current.description,
        amountCents: current.amountCents,
      },
      metadata: { borradoLogico: true },
    });

    return deleted;
  });
}

export async function listExpenses(
  ctx: RequestContext,
  input: ListExpensesInput,
): Promise<Page<unknown> & { totalAmountCents: number }> {
  requirePermission(ctx, PERMISSIONS.EXPENSES_READ);

  const where = {
    businessId: ctx.businessId,
    deletedAt: null,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.search
      ? {
          OR: [
            {
              description: {
                contains: input.search,
                mode: "insensitive" as const,
              },
            },
            {
              reference: { contains: input.search, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
    ...(input.from || input.to
      ? {
          spentAt: {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          },
        }
      : {}),
  };

  const [items, total, aggregate] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: { [input.sortBy]: input.sortDir },
      ...toSkipTake(input),
      select: expenseSelect,
    }),
    db.expense.count({ where }),
    // El total de los filtros actuales, no solo de la página visible: quien
    // filtra "Renta, este año" quiere saber cuánto suma en total.
    db.expense.aggregate({ where, _sum: { amountCents: true } }),
  ]);

  return {
    ...buildPage(items, total, input),
    totalAmountCents: aggregate._sum.amountCents ?? 0,
  };
}
