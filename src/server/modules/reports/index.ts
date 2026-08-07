/**
 * API pública del módulo `reports`.
 */

export { getDashboard, type DashboardMetrics } from "./dashboard";

export {
  expensesByCategory,
  inventoryValue,
  periodSummary,
  productsSold,
  reportRangeSchema,
  salesByPeriod,
  type ExpenseByCategoryRow,
  type InventoryValueRow,
  type ProductSoldRow,
  type ReportRange,
  type SalesByPeriodRow,
} from "./reports";
