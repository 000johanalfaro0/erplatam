import { z } from "zod";

import { AUDIT_ACTIONS } from "@/server/core/audit";
import { createCatalog } from "@/server/core/catalog";
import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import { NotFoundError } from "@/server/core/errors";
import { paginationSchema } from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";

/**
 * Módulo de clientes.
 *
 * CRM deliberadamente mínimo (requisito 9): nombre, contacto y notas. Los
 * campos fiscales existen pero son opcionales, listos para CFDI sin exigirlos
 * hoy — pedir el RFC para vender un refresco sería absurdo.
 *
 * Lo que sí aporta valor real: el historial de compras del cliente.
 */

/**
 * RFC mexicano.
 *
 * Persona moral: 3 letras + 6 dígitos de fecha + 3 de homoclave (12).
 * Persona física: 4 letras + 6 dígitos + 3 de homoclave (13).
 * Se admite la Ñ y el & porque aparecen en razones sociales reales.
 */
const rfcSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^([A-ZÑ&]{3,4}\d{6}[A-Z\d]{3})?$/,
    "El RFC no tiene un formato válido (ej. ABC010203XY1)",
  )
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

export const createCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(200, "Máximo 200 caracteres"),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("El correo no tiene un formato válido")
    .max(255)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  notes: z.string().trim().max(2000).optional().nullable(),

  // --- Datos fiscales, opcionales (preparados para CFDI 4.0) ---
  rfc: rfcSchema,
  legalName: z.string().trim().max(300).optional().nullable(),
  satRegimenFiscal: z.string().trim().max(10).optional().nullable(),
  satUsoCfdi: z.string().trim().max(10).optional().nullable(),
  satPostalCode: z
    .string()
    .trim()
    .regex(/^(\d{5})?$/, "El código postal debe tener 5 dígitos")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
});
export type ListCustomersInput = z.infer<typeof listCustomersSchema>;

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  notes: true,
  rfc: true,
  legalName: true,
  satRegimenFiscal: true,
  satUsoCfdi: true,
  satPostalCode: true,
  createdAt: true,
} as const;

const catalog = createCatalog<CreateCustomerInput, UpdateCustomerInput>({
  model: "customer",
  label: "El cliente",
  labelIndefinite: "un cliente",
  select: customerSelect,
  searchFields: ["name", "phone", "email", "rfc"],
  readPermission: PERMISSIONS.CUSTOMERS_READ,
  writePermission: PERMISSIONS.CUSTOMERS_WRITE,
  actions: {
    create: AUDIT_ACTIONS.CUSTOMER_CREATE,
    update: AUDIT_ACTIONS.CUSTOMER_UPDATE,
    delete: AUDIT_ACTIONS.CUSTOMER_DELETE,
  },
  auditedFields: ["name", "phone", "email", "rfc"],
  // Dos clientes pueden llamarse igual: hay muchas "María González", y
  // bloquearlo obligaría al cajero a inventar nombres para poder cobrar.
  uniqueName: false,
  schemas: { create: createCustomerSchema, update: updateCustomerSchema },
});

export const {
  list: listCustomers,
  getById: getCustomer,
  create: createCustomer,
  update: updateCustomer,
  remove: deleteCustomer,
} = catalog;

/**
 * Historial de compras de un cliente (requisito 9).
 *
 * Incluye el total acumulado y el ticket promedio: son las dos cifras que
 * responden "¿cuánto vale este cliente?", que es la pregunta real detrás de
 * consultar su historial.
 */
export async function getCustomerHistory(
  ctx: RequestContext,
  customerId: string,
  options: { page: number; pageSize: number },
) {
  requirePermission(ctx, PERMISSIONS.CUSTOMERS_READ);

  const customer = await db.customer.findFirst({
    where: { id: customerId, businessId: ctx.businessId, deletedAt: null },
    select: { id: true, name: true },
  });

  if (!customer) throw new NotFoundError("El cliente", customerId);

  // Las ventas canceladas se excluyen del acumulado: cobrar y luego cancelar
  // no puede seguir contando como compra del cliente.
  const where = {
    customerId,
    businessId: ctx.businessId,
    status: "COMPLETED" as const,
  };

  const [sales, total, aggregate] = await Promise.all([
    db.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: {
        id: true,
        folio: true,
        totalCents: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    db.sale.count({ where }),
    db.sale.aggregate({
      where,
      _sum: { totalCents: true },
      _avg: { totalCents: true },
      _max: { createdAt: true },
    }),
  ]);

  return {
    customer,
    sales,
    total,
    page: options.page,
    pageSize: options.pageSize,
    summary: {
      totalSpentCents: aggregate._sum.totalCents ?? 0,
      averageTicketCents: Math.round(aggregate._avg.totalCents ?? 0),
      purchaseCount: total,
      lastPurchaseAt: aggregate._max.createdAt,
    },
  };
}
