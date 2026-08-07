"use client";

import { useQuery } from "@tanstack/react-query";

import { api, type Paginated } from "./api";

/**
 * Consultas compartidas de la interfaz.
 *
 * Centralizar las claves de caché (`queryKey`) aquí evita el error más común
 * con TanStack Query: invalidar `["products"]` en un sitio y `["product"]` en
 * otro, de modo que la tabla no se refresca tras guardar y el usuario cree que
 * no se guardó.
 */

export const queryKeys = {
  reference: ["reference"] as const,
  products: (filters?: unknown) => ["products", filters] as const,
  product: (id: string) => ["product", id] as const,
  sales: (filters?: unknown) => ["sales", filters] as const,
  sale: (id: string) => ["sale", id] as const,
  movements: (filters?: unknown) => ["movements", filters] as const,
  dashboard: ["dashboard"] as const,
} as const;

// --- Datos de referencia ---------------------------------------------------

export interface ReferenceData {
  categories: { id: string; name: string; color: string | null }[];
  suppliers: { id: string; name: string }[];
  taxRates: {
    id: string;
    name: string;
    rateBps: number;
    isExempt: boolean;
    isDefault: boolean;
  }[];
  paymentMethods: {
    id: string;
    code: string;
    name: string;
    requiresChange: boolean;
  }[];
  expenseCategories: { id: string; name: string; color: string | null }[];
}

/**
 * Catálogos para poblar desplegables.
 *
 * Se cachean cinco minutos: son datos que casi nunca cambian y que casi todas
 * las pantallas necesitan. Sin caché, abrir cada formulario dispararía una
 * petición idéntica.
 */
export function useReference() {
  return useQuery({
    queryKey: queryKeys.reference,
    queryFn: () => api.get<ReferenceData>("/reference"),
    staleTime: 5 * 60_000,
  });
}

// --- Productos -------------------------------------------------------------

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  priceCents: number;
  costCents: number;
  stock: number;
  minStock: number | null;
  unit: string;
  status: "ACTIVE" | "INACTIVE";
  tracksInventory: boolean;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  taxRate: {
    id: string;
    name: string;
    rateBps: number;
    isExempt: boolean;
  } | null;
}

export interface ProductDetail extends Product {
  description: string | null;
  categoryId: string | null;
  supplierId: string | null;
  taxRateId: string | null;
  satProductCode: string | null;
  satUnitCode: string | null;
}

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  status?: string;
  lowStock?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: queryKeys.products(filters),
    queryFn: () =>
      api.get<Paginated<Product>>("/products", {
        search: filters.search,
        categoryId: filters.categoryId,
        status: filters.status,
        lowStock: filters.lowStock ? "true" : undefined,
        page: filters.page,
        pageSize: filters.pageSize,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      }),
    // Mantiene la tabla anterior visible mientras llega la nueva página, en
    // lugar de parpadear a un esqueleto. Al escribir en el buscador se nota
    // muchísimo.
    placeholderData: (previous) => previous,
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: queryKeys.product(id ?? ""),
    queryFn: () => api.get<ProductDetail>(`/products/${id}`),
    enabled: Boolean(id),
  });
}

// --- Movimientos de inventario --------------------------------------------

export interface Movement {
  id: string;
  type: string;
  quantityDelta: number;
  balanceAfter: number;
  unitCostCents: number | null;
  reason: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string; unit: string };
  user: { id: string; name: string } | null;
  sale: { id: string; folio: string } | null;
  purchase: { id: string; folio: string } | null;
}

export function useMovements(filters: {
  productId?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: queryKeys.movements(filters),
    queryFn: () => api.get<Paginated<Movement>>("/inventory/movements", filters),
    placeholderData: (previous) => previous,
  });
}

/** Etiquetas legibles de los tipos de movimiento. */
export const MOVEMENT_LABELS: Record<string, string> = {
  INITIAL: "Existencia inicial",
  ENTRY: "Entrada",
  EXIT: "Salida",
  ADJUSTMENT: "Ajuste",
  SALE: "Venta",
  PURCHASE: "Compra",
  RETURN: "Devolución",
  SALE_VOID: "Cancelación de venta",
  PURCHASE_VOID: "Cancelación de compra",
};
