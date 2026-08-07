import { z } from "zod";

import { AUDIT_ACTIONS } from "@/server/core/audit";
import { createCatalog } from "@/server/core/catalog";
import { paginationSchema } from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";

/**
 * Módulo de proveedores (requisito 10).
 *
 * Se relacionan con productos y compras. El campo `contact` guarda el nombre
 * de la persona con la que se habla, que en la práctica es más útil que el
 * nombre de la empresa cuando hay que llamar para resurtir.
 */

/**
 * RFC mexicano.
 *
 * Persona moral: 3 letras + 6 dígitos de fecha + 3 de homoclave (12).
 * Persona física: 4 letras + 6 dígitos + 3 de homoclave (13).
 * Se admite la Ñ y el & porque aparecen en razones sociales reales.
 * El patrón acepta cadena vacía para que el campo siga siendo opcional.
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

export const createSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(200, "Máximo 200 caracteres"),
  contact: z.string().trim().max(200).optional().nullable(),
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
  rfc: rfcSchema,
  address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const listSuppliersSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
});

const catalog = createCatalog<CreateSupplierInput, UpdateSupplierInput>({
  model: "supplier",
  label: "El proveedor",
  labelIndefinite: "un proveedor",
  select: {
    id: true,
    name: true,
    contact: true,
    phone: true,
    email: true,
    rfc: true,
    address: true,
    notes: true,
    createdAt: true,
  },
  searchFields: ["name", "contact", "phone", "email", "rfc"],
  readPermission: PERMISSIONS.SUPPLIERS_READ,
  writePermission: PERMISSIONS.SUPPLIERS_WRITE,
  actions: {
    create: AUDIT_ACTIONS.SUPPLIER_CREATE,
    update: AUDIT_ACTIONS.SUPPLIER_UPDATE,
    delete: AUDIT_ACTIONS.SUPPLIER_DELETE,
  },
  auditedFields: ["name", "contact", "phone", "email", "rfc"],
  // Los proveedores SÍ son únicos por nombre: dos "Distribuidora del Centro"
  // en el catálogo es siempre un error de captura, y confunde al elegir a
  // quién comprar.
  uniqueName: true,
  schemas: { create: createSupplierSchema, update: updateSupplierSchema },
});

export const {
  list: listSuppliers,
  getById: getSupplier,
  create: createSupplier,
  update: updateSupplier,
  remove: deleteSupplier,
} = catalog;
