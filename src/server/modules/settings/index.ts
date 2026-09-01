import { z } from "zod";

import { AUDIT_ACTIONS, audit } from "@/server/core/audit";
import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/core/errors";
import { PERMISSIONS } from "@/server/core/permissions";
import { transaction } from "@/server/core/tx";

/**
 * CONFIGURACIÓN DEL NEGOCIO
 * ===========================================================================
 * Impuestos, moneda, zona horaria y métodos de pago.
 *
 * POR QUÉ ESTE MÓDULO EXISTE
 * Las tres tablas ya estaban —`BusinessSettings`, `TaxRate`, `PaymentMethod`—
 * y el resto del sistema las leía correctamente. Lo que faltaba era poder
 * escribirlas sin abrir la base de datos. Un ERP donde cambiar el IVA exige
 * un `UPDATE` a mano no es un ERP, es una maqueta con datos reales.
 *
 * LAS DOS REGLAS QUE NO SE PUEDEN ROMPER
 *
 * 1. Una tasa de impuesto en uso NO se borra. Si se borrara, las ventas
 *    históricas que la referencian quedarían huérfanas. Se archiva
 *    (`deletedAt`), y las ventas viejas siguen apuntando a ella —además de
 *    tener su `taxRateBps` congelado en la línea, que es la defensa real—.
 *
 * 2. Cambiar la tasa por defecto NO reprecia nada. Afecta solo a los
 *    productos que se creen a partir de ahora. Quien quiera cambiar el
 *    impuesto de los productos existentes tiene que decirlo explícitamente,
 *    producto a producto. Un cambio de configuración que altere en silencio
 *    el precio de venta de 400 productos es exactamente el tipo de cosa que
 *    hace que nadie vuelva a confiar en el sistema.
 *
 * ZONA HORARIA: el valor se valida contra la lista real de la plataforma, no
 * contra una lista escrita a mano. Una zona inválida no rompe al guardarse:
 * rompe semanas después, cuando un reporte agrupe los días mal.
 */

// ---------------------------------------------------------------------------
// Ajustes generales
// ---------------------------------------------------------------------------

/** Comprueba que la zona horaria exista de verdad para el motor de fechas. */
function esZonaHorariaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

export const updateSettingsSchema = z.object({
  countryCode: z.enum(["PE", "MX", "CO", "EC", "CL", "AR"]).optional(),
  currency: z
    .string()
    .trim()
    .length(3, "El código de moneda tiene 3 letras (MXN, USD…)")
    .toUpperCase()
    .optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  timezone: z
    .string()
    .trim()
    .refine(esZonaHorariaValida, "Esa zona horaria no existe")
    .optional(),
  defaultTaxRateBps: z
    .number()
    .int()
    .min(0, "El impuesto no puede ser negativo")
    .max(10_000, "El impuesto no puede pasar del 100%")
    .optional(),
  pricesIncludeTax: z.boolean().optional(),
  allowNegativeStock: z.boolean().optional(),
  lowStockThreshold: z
    .number()
    .int()
    .min(0, "El umbral no puede ser negativo")
    .max(1_000_000_000)
    .optional(),
  satRegimenFiscal: z.string().trim().max(10).nullable().optional(),
  satPostalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "El código postal tiene 5 dígitos")
    .nullable()
    .optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

const settingsSelect = {
  countryCode: true,
  currency: true,
  locale: true,
  timezone: true,
  defaultTaxRateBps: true,
  pricesIncludeTax: true,
  allowNegativeStock: true,
  lowStockThreshold: true,
  satRegimenFiscal: true,
  satPostalCode: true,
  cfdiEnabled: true,
  updatedAt: true,
} as const;

export async function getSettings(ctx: RequestContext) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_READ);

  const settings = await db.businessSettings.findUnique({
    where: { businessId: ctx.businessId },
    select: settingsSelect,
  });

  if (!settings) {
    // El seed siempre las crea. Si faltan, el negocio está a medio construir
    // y es mejor decirlo que devolver valores por defecto inventados que
    // luego nadie sabría de dónde salieron.
    throw new NotFoundError("La configuración del negocio", ctx.businessId);
  }

  return settings;
}

export async function updateSettings(
  ctx: RequestContext,
  input: UpdateSettingsInput,
) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_WRITE);

  return transaction(async (tx) => {
    const antes = await tx.businessSettings.findUnique({
      where: { businessId: ctx.businessId },
      select: settingsSelect,
    });

    if (!antes) {
      throw new NotFoundError("La configuración del negocio", ctx.businessId);
    }

    const despues = await tx.businessSettings.update({
      where: { businessId: ctx.businessId },
      data: input,
      select: settingsSelect,
    });

    // Solo se audita lo que cambió de verdad. Un registro de auditoría que
    // dice "actualizó la configuración" sin decir qué campo no sirve para
    // nada cuando dentro de un mes haya que explicar por qué el IVA es otro.
    const cambios = Object.entries(input).reduce<Record<string, unknown>>(
      (acc, [campo]) => {
        const clave = campo as keyof typeof antes;
        if (antes[clave] !== despues[clave]) {
          acc[campo] = { de: antes[clave], a: despues[clave] };
        }
        return acc;
      },
      {},
    );

    if (Object.keys(cambios).length > 0) {
      await audit(tx, ctx, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        entityType: "BusinessSettings",
        entityId: ctx.businessId,
        before: antes,
        after: despues,
        metadata: { cambios },
      });
    }

    return despues;
  });
}

// ---------------------------------------------------------------------------
// Tasas de impuesto
// ---------------------------------------------------------------------------

export const createTaxRateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Ponle un nombre")
      .max(60, "Máximo 60 caracteres"),
    rateBps: z
      .number()
      .int()
      .min(0, "La tasa no puede ser negativa")
      .max(10_000, "La tasa no puede pasar del 100%"),
    isExempt: z.boolean().default(false),
    isDefault: z.boolean().default(false),
  })
  .refine((v) => !v.isExempt || v.rateBps === 0, {
    message: "Una tasa exenta tiene que ser 0%",
    path: ["rateBps"],
  });

export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;

export const updateTaxRateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  rateBps: z.number().int().min(0).max(10_000).optional(),
  isExempt: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;

const taxRateSelect = {
  id: true,
  name: true,
  rateBps: true,
  isExempt: true,
  isDefault: true,
} as const;

export async function listTaxRates(ctx: RequestContext) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_READ);

  const rates = await db.taxRate.findMany({
    where: { businessId: ctx.businessId, deletedAt: null },
    select: taxRateSelect,
    orderBy: [{ isDefault: "desc" }, { rateBps: "desc" }],
  });

  // Cuántos productos usa cada una. Sin este dato, borrar es a ciegas.
  const uso = await db.product.groupBy({
    by: ["taxRateId"],
    where: { businessId: ctx.businessId, deletedAt: null },
    _count: { _all: true },
  });

  const porTasa = new Map(uso.map((u) => [u.taxRateId, u._count._all]));

  return rates.map((rate) => ({
    ...rate,
    productCount: porTasa.get(rate.id) ?? 0,
  }));
}

/** Deja exactamente una tasa marcada como predeterminada. */
async function desmarcarOtrasPredeterminadas(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  businessId: string,
  exceptoId: string,
) {
  await tx.taxRate.updateMany({
    where: { businessId, isDefault: true, id: { not: exceptoId } },
    data: { isDefault: false },
  });
}

export async function createTaxRate(
  ctx: RequestContext,
  input: CreateTaxRateInput,
) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_WRITE);

  return transaction(async (tx) => {
    const repetida = await tx.taxRate.findFirst({
      where: { businessId: ctx.businessId, name: input.name },
      select: { id: true, deletedAt: true },
    });

    if (repetida) {
      throw new ConflictError(
        repetida.deletedAt
          ? `Ya existe una tasa archivada llamada "${input.name}". Cámbiale el nombre o restaura la anterior.`
          : `Ya existe una tasa llamada "${input.name}".`,
      );
    }

    const rate = await tx.taxRate.create({
      data: { businessId: ctx.businessId, ...input },
      select: taxRateSelect,
    });

    if (rate.isDefault) {
      await desmarcarOtrasPredeterminadas(tx, ctx.businessId, rate.id);
    }

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      entityType: "TaxRate",
      entityId: rate.id,
      after: rate,
      metadata: { operacion: "alta de tasa" },
    });

    return rate;
  });
}

export async function updateTaxRate(
  ctx: RequestContext,
  id: string,
  input: UpdateTaxRateInput,
) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_WRITE);

  return transaction(async (tx) => {
    const antes = await tx.taxRate.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
      select: taxRateSelect,
    });

    if (!antes) throw new NotFoundError("La tasa de impuesto", id);

    const exenta = input.isExempt ?? antes.isExempt;
    const tasa = input.rateBps ?? antes.rateBps;
    if (exenta && tasa !== 0) {
      throw new ValidationError("Una tasa exenta tiene que ser 0%.");
    }

    const rate = await tx.taxRate.update({
      where: { id },
      data: input,
      select: taxRateSelect,
    });

    if (rate.isDefault) {
      await desmarcarOtrasPredeterminadas(tx, ctx.businessId, rate.id);
    }

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      entityType: "TaxRate",
      entityId: id,
      before: antes,
      after: rate,
      metadata: {
        operacion: "cambio de tasa",
        // Si cambia el porcentaje, se deja dicho a las claras: es el dato que
        // alguien va a buscar cuando no le cuadre una venta.
        ...(antes.rateBps !== rate.rateBps
          ? { avisoTasaCambiada: `${antes.rateBps} → ${rate.rateBps} bps` }
          : {}),
      },
    });

    return rate;
  });
}

/**
 * Archiva una tasa. Nunca la borra.
 *
 * Se niega si la usa algún producto vivo: obligar a reasignar antes es
 * molesto, pero mucho menos que descubrir productos sin impuesto en mitad de
 * una venta.
 */
export async function archiveTaxRate(ctx: RequestContext, id: string) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_WRITE);

  return transaction(async (tx) => {
    const rate = await tx.taxRate.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
      select: taxRateSelect,
    });

    if (!rate) throw new NotFoundError("La tasa de impuesto", id);

    if (rate.isDefault) {
      throw new ValidationError(
        "No se puede archivar la tasa predeterminada. Marca otra como predeterminada primero.",
      );
    }

    const enUso = await tx.product.count({
      where: { businessId: ctx.businessId, taxRateId: id, deletedAt: null },
    });

    if (enUso > 0) {
      throw new ConflictError(
        `${enUso} ${enUso === 1 ? "producto usa" : "productos usan"} esta tasa. ` +
          "Cámbiales el impuesto antes de archivarla.",
      );
    }

    const archivada = await tx.taxRate.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: taxRateSelect,
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      entityType: "TaxRate",
      entityId: id,
      before: rate,
      metadata: { operacion: "archivado de tasa", borradoLogico: true },
    });

    return archivada;
  });
}

// ---------------------------------------------------------------------------
// Métodos de pago
// ---------------------------------------------------------------------------

export const createPaymentMethodSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "El código es demasiado corto")
    .max(20, "Máximo 20 caracteres")
    .regex(/^[A-Z0-9_]+$/, "Solo mayúsculas, números y guion bajo")
    .toUpperCase(),
  name: z.string().trim().min(1, "Ponle un nombre").max(60),
  requiresChange: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;

export const updatePaymentMethodSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  requiresChange: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;

const paymentMethodSelect = {
  id: true,
  code: true,
  name: true,
  requiresChange: true,
  isActive: true,
  sortOrder: true,
} as const;

export async function listPaymentMethods(ctx: RequestContext) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_READ);

  return db.paymentMethod.findMany({
    where: { businessId: ctx.businessId },
    select: paymentMethodSelect,
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createPaymentMethod(
  ctx: RequestContext,
  input: CreatePaymentMethodInput,
) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_WRITE);

  return transaction(async (tx) => {
    const repetido = await tx.paymentMethod.findFirst({
      where: { businessId: ctx.businessId, code: input.code },
      select: { id: true, name: true, isActive: true },
    });

    if (repetido) {
      throw new ConflictError(
        repetido.isActive
          ? `El código "${input.code}" ya lo usa "${repetido.name}".`
          : `El código "${input.code}" pertenece a "${repetido.name}", que está desactivado. Reactívalo en vez de crear otro.`,
      );
    }

    const method = await tx.paymentMethod.create({
      data: { businessId: ctx.businessId, ...input },
      select: paymentMethodSelect,
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      entityType: "PaymentMethod",
      entityId: method.id,
      after: method,
      metadata: { operacion: "alta de método de pago" },
    });

    return method;
  });
}

export async function updatePaymentMethod(
  ctx: RequestContext,
  id: string,
  input: UpdatePaymentMethodInput,
) {
  requirePermission(ctx, PERMISSIONS.SETTINGS_WRITE);

  return transaction(async (tx) => {
    const antes = await tx.paymentMethod.findFirst({
      where: { id, businessId: ctx.businessId },
      select: paymentMethodSelect,
    });

    if (!antes) throw new NotFoundError("El método de pago", id);

    // Desactivar el último método activo dejaría el punto de venta sin forma
    // de cobrar. Se comprueba aquí y no en la pantalla porque la pantalla no
    // es la única puerta de entrada.
    if (input.isActive === false && antes.isActive) {
      const activos = await tx.paymentMethod.count({
        where: { businessId: ctx.businessId, isActive: true },
      });

      if (activos <= 1) {
        throw new ValidationError(
          "Es el único método de pago activo. Sin él no se podría cobrar ninguna venta.",
        );
      }
    }

    const method = await tx.paymentMethod.update({
      where: { id },
      data: input,
      select: paymentMethodSelect,
    });

    await audit(tx, ctx, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      entityType: "PaymentMethod",
      entityId: id,
      before: antes,
      after: method,
      metadata: { operacion: "cambio de método de pago" },
    });

    return method;
  });
}
