import { z } from "zod";

import { AUDIT_ACTIONS } from "@/server/core/audit";
import { createCatalog } from "@/server/core/catalog";
import { paginationSchema } from "@/server/core/pagination";
import { PERMISSIONS } from "@/server/core/permissions";

/**
 * Categorías de producto y categorías de gasto.
 *
 * Ambas son listas de nombres con un color opcional, así que comparten
 * archivo. Siguen siendo entidades separadas en la base de datos: mezclar
 * "Bebidas" con "Renta" en una sola tabla obligaría a filtrar por tipo en cada
 * consulta y a rezar para que nadie lo olvide.
 */

const colorSchema = z
  .string()
  .trim()
  .regex(/^(#[0-9a-fA-F]{6})?$/, "El color debe ser hexadecimal, p. ej. #2563eb")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(100, "Máximo 100 caracteres"),
  color: colorSchema,
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listCategoriesSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
});

const select = {
  id: true,
  name: true,
  color: true,
  createdAt: true,
} as const;

// --- Categorías de producto ------------------------------------------------

const productCategories = createCatalog<
  CreateCategoryInput,
  UpdateCategoryInput
>({
  model: "category",
  label: "La categoría",
  labelIndefinite: "una categoría",
  select,
  searchFields: ["name"],
  readPermission: PERMISSIONS.PRODUCTS_READ,
  writePermission: PERMISSIONS.CATEGORIES_WRITE,
  actions: {
    create: AUDIT_ACTIONS.CATEGORY_CREATE,
    update: AUDIT_ACTIONS.CATEGORY_UPDATE,
    delete: AUDIT_ACTIONS.CATEGORY_DELETE,
  },
  auditedFields: ["name", "color"],
  // Dos categorías con el mismo nombre son siempre un error: al clasificar un
  // producto no se sabría cuál elegir.
  uniqueName: true,
  schemas: { create: createCategorySchema, update: updateCategorySchema },
});

export const {
  list: listCategories,
  getById: getCategory,
  create: createCategory,
  update: updateCategory,
  remove: deleteCategory,
} = productCategories;

// --- Categorías de gasto ---------------------------------------------------

const expenseCategories = createCatalog<
  CreateCategoryInput,
  UpdateCategoryInput
>({
  model: "expenseCategory",
  label: "La categoría de gasto",
  labelIndefinite: "una categoría de gasto",
  select,
  searchFields: ["name"],
  readPermission: PERMISSIONS.EXPENSES_READ,
  writePermission: PERMISSIONS.EXPENSES_WRITE,
  actions: {
    create: AUDIT_ACTIONS.CATEGORY_CREATE,
    update: AUDIT_ACTIONS.CATEGORY_UPDATE,
    delete: AUDIT_ACTIONS.CATEGORY_DELETE,
  },
  auditedFields: ["name", "color"],
  uniqueName: true,
  schemas: { create: createCategorySchema, update: updateCategorySchema },
});

export const {
  list: listExpenseCategories,
  create: createExpenseCategory,
  update: updateExpenseCategory,
  remove: deleteExpenseCategory,
} = expenseCategories;
