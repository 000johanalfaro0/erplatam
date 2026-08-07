/**
 * API pública del módulo `sales`.
 */

export {
  createSale,
  getSale,
  listSales,
  voidSale,
} from "./service";

export {
  createSaleSchema,
  listSalesSchema,
  voidSaleSchema,
  type CreateSaleInput,
  type ListSalesInput,
  type VoidSaleInput,
} from "./schema";
