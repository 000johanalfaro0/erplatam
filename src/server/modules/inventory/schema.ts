import { z } from "zod";

import { paginationSchema } from "@/server/core/pagination";

/**
 * Contratos del módulo de inventario.
 */

const quantitySchema = z
  .number()
  .int("La cantidad debe ser un entero en mili-unidades")
  .max(2_147_483_647, "La cantidad es demasiado grande");

/**
 * Entrada o salida manual de mercancía.
 *
 * `reason` es OBLIGATORIO. Un movimiento de inventario sin motivo es un
 * agujero contable: cuando dentro de dos meses falten diez piezas, la
 * bitácora debe poder responder por qué. Es la diferencia entre un sistema
 * auditable y uno que solo registra números.
 */
export const stockMovementSchema = z.object({
  productId: z.uuid("Selecciona un producto"),
  /** Cantidad SIEMPRE positiva; el signo lo determina el tipo de movimiento. */
  quantity: quantitySchema.min(1, "La cantidad debe ser mayor que cero"),
  reason: z
    .string()
    .trim()
    .min(3, "Explica el motivo del movimiento")
    .max(500, "Máximo 500 caracteres"),
  /** Costo unitario asociado, solo relevante en entradas. */
  unitCostCents: z.number().int().min(0).optional(),
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

/**
 * Ajuste por conteo físico.
 *
 * A diferencia de entrada/salida, aquí NO se indica cuánto sumar o restar,
 * sino cuánto hay REALMENTE en el anaquel. El sistema calcula la diferencia.
 *
 * Esta distinción importa: quien hace un inventario físico cuenta piezas, no
 * calcula diferencias. Pedirle que reste mentalmente es pedirle que se
 * equivoque.
 */
export const stockAdjustmentSchema = z.object({
  productId: z.uuid("Selecciona un producto"),
  /** Existencia real contada, en mili-unidades. */
  countedQuantity: quantitySchema.min(0, "No puede ser negativa"),
  reason: z
    .string()
    .trim()
    .min(3, "Explica el motivo del ajuste")
    .max(500, "Máximo 500 caracteres"),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const listMovementsSchema = paginationSchema.extend({
  productId: z.uuid().optional(),
  type: z
    .enum([
      "INITIAL",
      "ENTRY",
      "EXIT",
      "ADJUSTMENT",
      "SALE",
      "PURCHASE",
      "RETURN",
      "SALE_VOID",
      "PURCHASE_VOID",
    ])
    .optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export type ListMovementsInput = z.infer<typeof listMovementsSchema>;
