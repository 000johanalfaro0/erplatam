import type { z } from "zod";

import { AUDIT_ACTIONS, type AuditAction, audit } from "./audit";
import { type RequestContext, requirePermission } from "./context";
import { db } from "./db";
import { ConflictError, NotFoundError } from "./errors";
import { type Page, buildPage, normalizeSearch, toSkipTake } from "./pagination";
import { type Tx, transaction } from "./tx";

/**
 * Fábrica de catálogos simples.
 *
 * POR QUÉ EXISTE ESTA ABSTRACCIÓN (y por qué no es sobreingeniería)
 * ---------------------------------------------------------------------------
 * Clientes, proveedores, categorías y categorías de gasto comparten
 * EXACTAMENTE el mismo comportamiento: listar con búsqueda y paginación,
 * obtener por id, crear, editar, borrar lógicamente, y auditar cada
 * modificación. Lo único que cambia son los campos, el permiso requerido y el
 * nombre de la tabla.
 *
 * Escribir eso cuatro veces produce ~600 líneas casi idénticas. El problema no
 * es la extensión: es que cuando haya que corregir algo —por ejemplo, que el
 * borrado lógico compruebe referencias antes de borrar— hay que acordarse de
 * hacerlo en los cuatro sitios. Y no se hará.
 *
 * DÓNDE SE PARA LA ABSTRACCIÓN: aquí. Productos, ventas, compras e inventario
 * NO la usan, porque tienen reglas propias (transacciones, bloqueos, folios,
 * movimientos). Forzarlos a entrar aquí sí sería sobreingeniería. Esta fábrica
 * cubre solo lo verdaderamente repetitivo.
 */

export interface CatalogConfig<TCreate, TUpdate> {
  /** Nombre del modelo en Prisma: "customer", "supplier", "category". */
  model: "customer" | "supplier" | "category" | "expenseCategory";
  /**
   * Nombre legible con artículo DETERMINADO: "El proveedor", "La categoría".
   * Se usa en mensajes de "no encontrado".
   */
  label: string;
  /**
   * Nombre legible con artículo INDETERMINADO: "un proveedor", "una categoría".
   * Se usa en mensajes de duplicado.
   *
   * Son dos campos y no uno derivado porque el español no permite deducir el
   * género de forma fiable, y un ERP que escribe mal delata descuido en todo
   * lo demás.
   */
  labelIndefinite: string;
  /** Campos que se devuelven en listados y detalle. */
  select: Record<string, unknown>;
  /** Campos de texto sobre los que busca el término libre. */
  searchFields: string[];
  /** Permiso para leer. */
  readPermission: string;
  /** Permiso para crear, editar y borrar. */
  writePermission: string;
  /** Verbos de auditoría. */
  actions: {
    create: AuditAction;
    update: AuditAction;
    delete: AuditAction;
  };
  /** Campos que se registran en la bitácora al editar. */
  auditedFields: string[];
  /**
   * Si el nombre debe ser único dentro del negocio. Las categorías sí; los
   * clientes no (puede haber dos "María González" distintas, y bloquearlo
   * obligaría al cajero a inventar nombres).
   */
  uniqueName: boolean;
  schemas: {
    create: z.ZodType<TCreate>;
    update: z.ZodType<TUpdate>;
  };
}

export interface ListCatalogInput {
  page: number;
  pageSize: number;
  search?: string;
}

/**
 * Construye el conjunto de operaciones de un catálogo.
 *
 * Devuelve funciones normales, no una clase: son más fáciles de exportar
 * selectivamente desde el `index.ts` del módulo y de sustituir una a una si
 * alguna necesita comportamiento propio.
 */
export function createCatalog<TCreate extends { name: string }, TUpdate>(
  config: CatalogConfig<TCreate, TUpdate>,
) {
  // Acceso dinámico al modelo. El tipo se relaja aquí a propósito y se
  // recupera en la frontera pública de cada módulo, que sí está tipada.
  type AnyDelegate = {
    findMany: (args: unknown) => Promise<unknown[]>;
    findFirst: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<Record<string, unknown>>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
  };

  const delegate = () => db[config.model] as unknown as AnyDelegate;
  const txDelegate = (tx: Tx) =>
    tx[config.model] as unknown as AnyDelegate;

  function buildWhere(businessId: string, search?: string) {
    const term = normalizeSearch(search);

    return {
      businessId,
      // El borrado lógico se filtra SIEMPRE: un registro eliminado sigue
      // existiendo para que los documentos históricos lo referencien, pero no
      // aparece en ningún listado operativo.
      deletedAt: null,
      ...(term
        ? {
            OR: config.searchFields.map((field) => ({
              [field]: { contains: term, mode: "insensitive" as const },
            })),
          }
        : {}),
    };
  }

  async function list(
    ctx: RequestContext,
    input: ListCatalogInput,
  ): Promise<Page<unknown>> {
    requirePermission(ctx, config.readPermission);

    const where = buildWhere(ctx.businessId, input.search);

    const [items, total] = await Promise.all([
      delegate().findMany({
        where,
        select: config.select,
        orderBy: { name: "asc" },
        ...toSkipTake(input),
      }),
      delegate().count({ where }),
    ]);

    return buildPage(items, total, input);
  }

  async function getById(ctx: RequestContext, id: string) {
    requirePermission(ctx, config.readPermission);

    const record = await delegate().findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: null },
      select: config.select,
    });

    if (!record) throw new NotFoundError(config.label, id);
    return record;
  }

  /** Comprueba unicidad del nombre cuando el catálogo la exige. */
  async function assertNameAvailable(
    tx: Tx,
    businessId: string,
    name: string,
    excludeId?: string,
  ) {
    if (!config.uniqueName) return;

    const existing = await txDelegate(tx).findFirst({
      where: {
        businessId,
        name,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError(
        `Ya existe ${config.labelIndefinite} con el nombre "${name}".`,
      );
    }
  }

  async function create(ctx: RequestContext, input: TCreate) {
    requirePermission(ctx, config.writePermission);

    return transaction(async (tx) => {
      await assertNameAvailable(tx, ctx.businessId, input.name);

      const record = await txDelegate(tx).create({
        data: { ...input, businessId: ctx.businessId },
        select: config.select,
      });

      await audit(tx, ctx, {
        action: config.actions.create,
        entityType: config.model,
        entityId: record.id as string,
        after: pick(record, config.auditedFields),
      });

      return record;
    });
  }

  async function update(ctx: RequestContext, id: string, input: TUpdate) {
    requirePermission(ctx, config.writePermission);

    return transaction(async (tx) => {
      const current = (await txDelegate(tx).findFirst({
        where: { id, businessId: ctx.businessId, deletedAt: null },
        select: config.select,
      })) as Record<string, unknown> | null;

      if (!current) throw new NotFoundError(config.label, id);

      const nextName = (input as { name?: string }).name;
      if (nextName && nextName !== current.name) {
        await assertNameAvailable(tx, ctx.businessId, nextName, id);
      }

      const record = await txDelegate(tx).update({
        where: { id },
        data: input as Record<string, unknown>,
        select: config.select,
      });

      // Solo se registran los campos que realmente cambiaron: una bitácora que
      // guarda el objeto entero en cada edición es ilegible cuando hace falta.
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      for (const field of config.auditedFields) {
        if (current[field] !== record[field]) {
          before[field] = current[field];
          after[field] = record[field];
        }
      }

      if (Object.keys(after).length > 0) {
        await audit(tx, ctx, {
          action: config.actions.update,
          entityType: config.model,
          entityId: id,
          before,
          after,
          metadata: { nombre: record.name },
        });
      }

      return record;
    });
  }

  /**
   * Borrado lógico.
   *
   * Nunca se borra físicamente: las ventas y compras históricas referencian a
   * clientes y proveedores, y borrarlos dejaría documentos huérfanos.
   */
  async function remove(ctx: RequestContext, id: string) {
    requirePermission(ctx, config.writePermission);

    return transaction(async (tx) => {
      const current = (await txDelegate(tx).findFirst({
        where: { id, businessId: ctx.businessId, deletedAt: null },
        select: config.select,
      })) as Record<string, unknown> | null;

      if (!current) throw new NotFoundError(config.label, id);

      const record = await txDelegate(tx).update({
        where: { id },
        data: { deletedAt: new Date() },
        select: { id: true, name: true },
      });

      await audit(tx, ctx, {
        action: config.actions.delete,
        entityType: config.model,
        entityId: id,
        before: pick(current, config.auditedFields),
        metadata: { borradoLogico: true },
      });

      return record;
    });
  }

  return { list, getById, create, update, remove };
}

function pick(
  source: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in source) output[field] = source[field];
  }
  return output;
}

export { AUDIT_ACTIONS };
