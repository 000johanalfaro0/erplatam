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
  customers: (filters?: unknown) => ["customers", filters] as const,
  customer: (id: string) => ["customer", id] as const,
  customerHistory: (id: string, filters?: unknown) =>
    ["customer", id, "history", filters] as const,
  suppliers: (filters?: unknown) => ["suppliers", filters] as const,
  expenses: (filters?: unknown) => ["expenses", filters] as const,
  purchases: (filters?: unknown) => ["purchases", filters] as const,
  purchase: (id: string) => ["purchase", id] as const,
  audit: (filters?: unknown) => ["audit", filters] as const,
  reports: (filters?: unknown) => ["reports", filters] as const,
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
export function useReference(initialData?: ReferenceData) {
  return useQuery({
    queryKey: queryKeys.reference,
    queryFn: () => api.get<ReferenceData>("/reference"),
    staleTime: 5 * 60_000,
    // Cuando la página es un componente de servidor, estos catálogos llegan
    // ya resueltos y se evita una petición adicional al montar.
    initialData,
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

export function useProducts(
  filters: ProductFilters,
  initialData?: Paginated<Product>,
) {
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
    // Datos de la primera carga, resueltos en el servidor dentro del mismo
    // viaje que la página. Evita el segundo viaje y el esqueleto inicial.
    initialData,
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

// --- Ventas ----------------------------------------------------------------

export interface Sale {
  id: string;
  folio: string;
  status: "COMPLETED" | "VOIDED";
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  createdAt: string;
  customer: { id: string; name: string } | null;
  user: { id: string; name: string };
  _count: { items: number };
  payments: { method: { code: string; name: string } }[];
}

export interface SaleDetail {
  id: string;
  folio: string;
  status: "COMPLETED" | "VOIDED";
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  customer: { id: string; name: string; rfc: string | null } | null;
  user: { id: string; name: string };
  items: {
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitPriceCents: number;
    priceIncludesTax: boolean;
    discountCents: number;
    taxRateBps: number;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
  }[];
  payments: {
    id: string;
    amountCents: number;
    receivedCents: number | null;
    changeCents: number | null;
    reference: string | null;
    method: { id: string; code: string; name: string };
  }[];
}

export interface SaleFilters {
  search?: string;
  status?: string;
  customerId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function useSales(
  filters: SaleFilters,
  initialData?: Paginated<Sale>,
) {
  return useQuery({
    queryKey: queryKeys.sales(filters),
    queryFn: () => api.get<Paginated<Sale>>("/sales", filters),
    placeholderData: (previous) => previous,
    // Primera carga resuelta en el servidor. Quien la pasa se encarga de
    // hacerlo solo cuando los filtros son los de por defecto.
    initialData,
  });
}

export function useSale(id: string | null) {
  return useQuery({
    queryKey: queryKeys.sale(id ?? ""),
    queryFn: () => api.get<SaleDetail>(`/sales/${id}`),
    enabled: Boolean(id),
  });
}

// --- Clientes --------------------------------------------------------------

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  rfc: string | null;
  legalName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerFilters {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: queryKeys.customers(filters),
    queryFn: () => api.get<Paginated<Customer>>("/customers", filters),
    placeholderData: (previous) => previous,
  });
}

export interface CustomerHistory {
  customer: { id: string; name: string };
  sales: {
    id: string;
    folio: string;
    totalCents: number;
    createdAt: string;
    _count: { items: number };
  }[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    totalSpentCents: number;
    averageTicketCents: number;
    purchaseCount: number;
    lastPurchaseAt: string | null;
  };
}

export function useCustomerHistory(
  id: string | null,
  filters: { page?: number; pageSize?: number },
) {
  return useQuery({
    queryKey: queryKeys.customerHistory(id ?? "", filters),
    queryFn: () =>
      api.get<CustomerHistory>(`/customers/${id}/history`, filters),
    enabled: Boolean(id),
  });
}

// --- Proveedores -----------------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  rfc: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SupplierFilters {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function useSuppliers(filters: SupplierFilters) {
  return useQuery({
    queryKey: queryKeys.suppliers(filters),
    queryFn: () => api.get<Paginated<Supplier>>("/suppliers", filters),
    placeholderData: (previous) => previous,
  });
}

// --- Gastos ----------------------------------------------------------------

export interface Expense {
  id: string;
  description: string;
  amountCents: number;
  spentAt: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  category: { id: string; name: string; color: string | null } | null;
  method: { id: string; code: string; name: string } | null;
  user: { id: string; name: string };
}

export interface ExpenseFilters {
  search?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function useExpenses(filters: ExpenseFilters) {
  return useQuery({
    queryKey: queryKeys.expenses(filters),
    queryFn: () =>
      api.get<Paginated<Expense> & { totalAmountCents: number }>(
        "/expenses",
        filters,
      ),
    placeholderData: (previous) => previous,
  });
}

// --- Compras ---------------------------------------------------------------

export interface Purchase {
  id: string;
  folio: string;
  status: "DRAFT" | "RECEIVED" | "VOIDED";
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  invoiceNumber: string | null;
  notes: string | null;
  purchasedAt: string;
  createdAt: string;
  supplier: { id: string; name: string } | null;
  user: { id: string; name: string };
  _count: { items: number };
}

export interface PurchaseDetail {
  id: string;
  folio: string;
  status: "DRAFT" | "RECEIVED" | "VOIDED";
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  invoiceNumber: string | null;
  notes: string | null;
  purchasedAt: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  supplier: { id: string; name: string } | null;
  user: { id: string; name: string };
  items: {
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitCostCents: number;
    taxRateBps: number;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
  }[];
}

export interface PurchaseFilters {
  search?: string;
  status?: string;
  supplierId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function usePurchases(filters: PurchaseFilters) {
  return useQuery({
    queryKey: queryKeys.purchases(filters),
    queryFn: () => api.get<Paginated<Purchase>>("/purchases", filters),
    placeholderData: (previous) => previous,
  });
}

export function usePurchase(id: string | null) {
  return useQuery({
    queryKey: queryKeys.purchase(id ?? ""),
    queryFn: () => api.get<PurchaseDetail>(`/purchases/${id}`),
    enabled: Boolean(id),
  });
}

// --- Auditoría -------------------------------------------------------------

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function useAudit(filters: AuditFilters) {
  return useQuery({
    queryKey: queryKeys.audit(filters),
    queryFn: () => api.get<Paginated<AuditEntry>>("/audit", filters),
    placeholderData: (previous) => previous,
  });
}

// --- Reportes --------------------------------------------------------------

export interface ReportData {
  salesByDay: { date: string; totalCents: number; count: number }[];
  topProducts: {
    productId: string;
    productName: string;
    totalQuantity: number;
    totalCents: number;
  }[];
  expensesByCategory: { categoryName: string; totalCents: number }[];
  summary: {
    totalSalesCents: number;
    totalExpensesCents: number;
    grossProfitCents: number;
    salesCount: number;
    averageTicketCents: number;
  };
}

export function useReports(filters: { from?: string; to?: string; period?: string }) {
  return useQuery({
    queryKey: queryKeys.reports(filters),
    queryFn: () => api.get<ReportData>("/reports", filters),
    placeholderData: (previous) => previous,
  });
}
