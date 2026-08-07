import { z } from "zod";

import { paginationSchema } from "@/server/core/pagination";

/**
 * Contratos del módulo de ventas.
 */

export const saleItemSchema = z.object({
  productId: z.uuid("Producto inválido"),
  /** Mili-unidades. 1 pieza = 1000. */
  quantity: z
    .number()
    .int("La cantidad debe ser entera en mili-unidades")
    .min(1, "La cantidad debe ser mayor que cero")
    .max(2_147_483_647),
  /**
   * Precio unitario. Opcional: si se omite, se toma el del catálogo.
   *
   * Permitirlo habilita descuentos puntuales y precios negociados, que existen
   * en cualquier mostrador real. Queda registrado en la venta y en la
   * auditoría, así que es una excepción trazable, no un agujero.
   */
  unitPriceCents: z.number().int().min(0).optional(),
  discountCents: z.number().int().min(0).default(0),
});

export const paymentSchema = z.object({
  paymentMethodId: z.uuid("Selecciona un método de pago"),
  amountCents: z
    .number()
    .int()
    .min(1, "El importe del pago debe ser mayor que cero"),
  /** Efectivo recibido. Solo aplica a métodos que dan cambio. */
  receivedCents: z.number().int().min(0).optional(),
  reference: z.string().trim().max(100).optional(),
});

export const createSaleSchema = z.object({
  items: z
    .array(saleItemSchema)
    .min(1, "Agrega al menos un producto a la venta")
    .max(200, "Una venta no puede tener más de 200 líneas"),

  /**
   * Pagos. Se admite más de uno: pagar una parte en efectivo y otra con
   * tarjeta es habitual.
   */
  payments: z
    .array(paymentSchema)
    .min(1, "Registra al menos un método de pago")
    .max(5),

  customerId: z.uuid().optional().nullable(),
  /** Descuento a nivel de ticket, en centavos. */
  discountCents: z.number().int().min(0).default(0),
  notes: z.string().trim().max(1000).optional().nullable(),

  /**
   * Clave de idempotencia.
   *
   * La genera el cliente (un UUID por intento de cobro) y la reenvía en cada
   * reintento. Si la red falla después de que el servidor confirmó la venta,
   * el reintento devuelve la MISMA venta en lugar de crear una segunda.
   *
   * Es la diferencia entre "el cajero pulsó Cobrar dos veces" y "se le cobró
   * dos veces al cliente".
   */
  idempotencyKey: z.uuid("Clave de idempotencia inválida").optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

/**
 * Cancelación de venta.
 *
 * Una venta NUNCA se borra ni se edita (requisito 14). Se cancela, lo que
 * revierte el inventario y deja el documento en el histórico marcado como
 * VOIDED, con motivo y responsable.
 */
export const voidSaleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Explica por qué se cancela la venta")
    .max(500),
});

export type VoidSaleInput = z.infer<typeof voidSaleSchema>;

export const listSalesSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["COMPLETED", "VOIDED"]).optional(),
  customerId: z.uuid().optional(),
  userId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sortBy: z.enum(["createdAt", "totalCents", "folio"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListSalesInput = z.infer<typeof listSalesSchema>;
