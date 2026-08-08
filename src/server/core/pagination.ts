import { z } from "zod";

/**
 * Paginación compartida por todos los listados.
 *
 * Se pagina SIEMPRE, incluso en tablas que hoy tienen veinte filas. Un
 * `findMany()` sin límite funciona perfectamente en la demo y tumba el
 * servidor el día que el cliente cargue su catálogo completo. Poner el límite
 * después es una migración de cada endpoint; ponerlo ahora es gratis.
 */

export const MAX_PAGE_SIZE = 100;

/**
 * Tope para las exportaciones a Excel.
 *
 * Más alto que `MAX_PAGE_SIZE` y a propósito. El techo de 100 protege a la
 * API pública de que alguien pida un millón de filas por accidente; una
 * exportación es otra cosa: se pide una vez, a mano, y devolver "los primeros
 * 100 gastos" en un archivo que dice "Gastos" sería mentir en silencio.
 *
 * NO se pasa por el esquema de Zod —ahí el máximo sigue siendo 100—, sino que
 * se impone en la ruta de exportación después de validar el resto de filtros.
 * Así el límite público no se relaja para nadie más.
 */
export const MAX_EXPORT_SIZE = 5000;
export const DEFAULT_PAGE_SIZE = 25;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    // Techo duro: impide que alguien pida `pageSize=1000000` y agote la
    // memoria del proceso.
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function toSkipTake(input: PaginationInput) {
  return {
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize,
  };
}

export function buildPage<T>(
  items: T[],
  total: number,
  input: PaginationInput,
): Page<T> {
  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

/**
 * Valida el campo de ordenación contra una lista blanca.
 *
 * Es una defensa concreta: sin ella, pasar el nombre de columna directamente
 * a `orderBy` permitiría ordenar por campos internos (`passwordHash`) y
 * deducir su contenido observando el orden de los resultados. Ordenar es una
 * primitiva de lectura más poderosa de lo que parece.
 */
export function sortableEnum<const T extends readonly [string, ...string[]]>(
  fields: T,
  fallback: T[number],
) {
  return z
    .object({
      sortBy: z.enum(fields).default(fallback as never),
      sortDir: z.enum(["asc", "desc"]).default("desc"),
    })
    .partial()
    .transform((value) => ({
      sortBy: (value.sortBy ?? fallback) as T[number],
      sortDir: value.sortDir ?? ("desc" as const),
    }));
}

/**
 * Normaliza un término de búsqueda.
 *
 * No hay riesgo de inyección SQL: Prisma parametriza siempre. Lo que se evita
 * aquí es que una búsqueda de 5.000 caracteres provoque un escaneo secuencial
 * carísimo.
 */
export function normalizeSearch(term: string | undefined): string | undefined {
  const trimmed = term?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 100);
}
