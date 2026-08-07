"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import { EmptyState, TableSkeleton } from "./surface";

/**
 * Tabla de datos.
 *
 * Es el componente más reutilizado del sistema: productos, ventas, compras,
 * gastos, clientes, proveedores, movimientos y auditoría comparten esta misma
 * implementación. Cualquier mejora aquí — orden, densidad, accesibilidad — se
 * propaga a todos los módulos a la vez, que es exactamente el objetivo de la
 * regla "evitar duplicación".
 *
 * Decisiones:
 *
 *   - Se renderiza una `<table>` real, no divs con `role`. Un lector de
 *     pantalla anuncia entonces "columna 3 de 7, Precio", y Playwright puede
 *     usar `getByRole("row")` y `getByRole("cell")` sin ayuda extra.
 *   - Ordenación en el servidor, no en el cliente: la tabla puede tener 20.000
 *     productos y ordenar solo la página visible daría un resultado
 *     incorrecto.
 *   - Los tres estados posibles — cargando, vacío, con datos — son
 *     mutuamente excluyentes y explícitos. Nunca una tabla vacía sin
 *     explicación.
 */

export interface Column<T> {
  /** Identificador estable. Si es ordenable, se envía al servidor. */
  key: string;
  header: string;
  /** Contenido de la celda. */
  cell: (row: T) => React.ReactNode;
  /** Alineación. Los importes SIEMPRE a la derecha. */
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** Clases del `<th>` y los `<td>`: anchos, ocultar en móvil, etc. */
  className?: string;
  /** Oculta la columna por debajo de tablet. */
  hideOnMobile?: boolean;
}

export interface SortState {
  key: string;
  direction: "asc" | "desc";
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Clave estable por fila. Nunca el índice. */
  rowKey: (row: T) => string;
  loading?: boolean;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  onRowClick?: (row: T) => void;
  /** Estado vacío. Debe indicar el siguiente paso. */
  empty?: React.ReactNode;
  /** Etiqueta accesible de la tabla. */
  caption: string;
  className?: string;
  /** Resalta filas que requieren atención (stock bajo, venta cancelada). */
  rowTone?: (row: T) => "default" | "muted" | "warning" | "danger";
}

const alignClasses = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  sort,
  onSortChange,
  onRowClick,
  empty,
  caption,
  className,
  rowTone,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={cn("overflow-hidden rounded-lg border border-line bg-surface", className)}>
        <TableSkeleton columns={columns.length} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={cn("rounded-lg border border-line bg-surface", className)}>
        {empty ?? (
          <EmptyState
            title="Sin resultados"
            description="No hay registros que coincidan con los filtros actuales."
          />
        )}
      </div>
    );
  }

  function handleSort(column: Column<T>) {
    if (!column.sortable || !onSortChange) return;

    const direction =
      sort?.key === column.key && sort.direction === "asc" ? "desc" : "asc";
    onSortChange({ key: column.key, direction });
  }

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-line bg-surface scroll-slim",
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>

        <thead>
          <tr className="border-b border-line bg-surface-sunken">
            {columns.map((column) => {
              const isSorted = sort?.key === column.key;

              return (
                <th
                  key={column.key}
                  scope="col"
                  // aria-sort permite a un lector de pantalla — y a un agente
                  // de pruebas — saber el orden vigente sin mirar el icono.
                  aria-sort={
                    isSorted
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : column.sortable
                        ? "none"
                        : undefined
                  }
                  className={cn(
                    "px-4 py-2.5 text-[12px] font-medium text-ink-muted whitespace-nowrap",
                    alignClasses[column.align ?? "left"],
                    column.hideOnMobile && "hidden md:table-cell",
                    column.className,
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-xs transition-colors hover:text-ink",
                        isSorted && "text-ink",
                      )}
                    >
                      {column.header}
                      <span
                        aria-hidden
                        className={cn(
                          "text-[10px] leading-none transition-opacity",
                          isSorted ? "opacity-100" : "opacity-0",
                        )}
                      >
                        {isSorted && sort.direction === "desc" ? "▼" : "▲"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const tone = rowTone?.(row) ?? "default";

            return (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                // Las filas clicables son operables con teclado: sin esto, un
                // usuario que no usa ratón no podría abrir ningún detalle.
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "border-b border-line last:border-0 transition-colors",
                  onRowClick &&
                    "cursor-pointer hover:bg-surface-sunken focus-visible:bg-surface-sunken",
                  tone === "muted" && "opacity-55",
                  tone === "warning" && "bg-warning-soft/40",
                  tone === "danger" && "bg-danger-soft/40",
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3 text-ink align-middle",
                      alignClasses[column.align ?? "left"],
                      column.align === "right" && "numeric",
                      column.hideOnMobile && "hidden md:table-cell",
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Paginación ------------------------------------------------------------

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Paginación.
 *
 * Muestra el rango absoluto ("41-60 de 312") en lugar de solo el número de
 * página: quien revisa un inventario necesita saber cuánto le falta, no en qué
 * página va.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  if (total <= pageSize) return null;

  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-between gap-4 px-1 pt-3"
    >
      <p className="text-[13px] text-ink-muted" aria-live="polite">
        <span className="numeric">
          {from}–{to}
        </span>{" "}
        de <span className="numeric">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="px-2 text-[13px] text-ink-muted numeric">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Página siguiente"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
