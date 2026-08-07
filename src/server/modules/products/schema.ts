import { z } from "zod";

import { paginationSchema } from "@/server/core/pagination";

/**
 * Contratos del módulo de productos.
 *
 * Nota sobre dinero y cantidades: la API recibe y devuelve SIEMPRE enteros
 * (centavos y mili-unidades). La conversión desde lo que el usuario escribe
 * ("45.50") ocurre en el formulario, antes de llamar a la API. Así el punto
 * flotante no cruza nunca la frontera de red.
 */

const UNITS = [
  "PIECE",
  "KG",
  "G",
  "L",
  "ML",
  "BOX",
  "PACK",
  "SERVICE",
] as const;

/** SKU: identificador interno. Se normaliza para evitar duplicados por caja. */
const skuSchema = z
  .string()
  .trim()
  .min(1, "El SKU es obligatorio")
  .max(50, "Máximo 50 caracteres")
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "Solo letras, números, punto, guion y guion bajo",
  )
  .transform((value) => value.toUpperCase());

const moneySchema = z
  .number()
  .int("Debe ser un importe en centavos (entero)")
  .min(0, "No puede ser negativo")
  // 21.4 millones de pesos por unidad. Un valor mayor casi siempre significa
  // que alguien envió pesos donde se esperaban centavos.
  .max(2_147_483_647, "El importe es demasiado grande");

const quantitySchema = z
  .number()
  .int("Debe ser una cantidad en mili-unidades (entero)")
  .min(0, "No puede ser negativa")
  .max(2_147_483_647, "La cantidad es demasiado grande");

export const createProductSchema = z.object({
  sku: skuSchema,
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(200, "Máximo 200 caracteres"),
  description: z.string().trim().max(1000).optional().nullable(),
  barcode: z
    .string()
    .trim()
    .max(50)
    .optional()
    .nullable()
    // Cadena vacía y ausencia son lo mismo: si no, dos productos sin código de
    // barras chocarían contra el índice único.
    .transform((value) => (value ? value : null)),

  categoryId: z.uuid().optional().nullable(),
  supplierId: z.uuid().optional().nullable(),
  taxRateId: z.uuid().optional().nullable(),

  priceCents: moneySchema,
  costCents: moneySchema.default(0),

  unit: z.enum(UNITS).default("PIECE"),

  /**
   * Existencia inicial. Solo al crear: después, el stock únicamente cambia
   * mediante movimientos de inventario.
   */
  initialStock: quantitySchema.default(0),
  minStock: quantitySchema.optional().nullable(),

  tracksInventory: z.boolean().default(true),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),

  // Campos fiscales, preparados para CFDI. Opcionales siempre.
  satProductCode: z.string().trim().max(20).optional().nullable(),
  satUnitCode: z.string().trim().max(20).optional().nullable(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Actualización.
 *
 * `stock` NO está aquí a propósito. Modificar la existencia es una operación
 * de inventario con su propio permiso, su propio motivo y su propio
 * movimiento registrado. Permitir cambiarla en un PATCH de producto abriría un
 * agujero por el que se podría alterar el inventario sin dejar rastro — que es
 * justo lo que el requisito 6 prohíbe.
 */
export const updateProductSchema = createProductSchema
  .omit({ initialStock: true })
  .partial();

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  categoryId: z.uuid().optional(),
  supplierId: z.uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  /** Solo productos por debajo de su punto de reorden. */
  lowStock: z.coerce.boolean().optional(),
  sortBy: z
    .enum(["name", "sku", "priceCents", "stock", "createdAt"])
    .default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type ListProductsInput = z.infer<typeof listProductsSchema>;
