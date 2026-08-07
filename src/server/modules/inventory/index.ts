/**
 * API pública del módulo `inventory`.
 *
 * `applyMovement` se exporta a propósito: es la ÚNICA vía por la que ventas y
 * compras pueden tocar existencias. Al exponer solo esa función, y no el
 * acceso directo a la tabla, se garantiza estructuralmente que todo cambio de
 * inventario quede asentado en el libro mayor.
 */

export {
  adjustStock,
  applyMovement,
  applyMovements,
  listMovements,
  registerEntry,
  registerExit,
  verifyIntegrity,
  type MovementSpec,
} from "./service";

export {
  listMovementsSchema,
  stockAdjustmentSchema,
  stockMovementSchema,
  type ListMovementsInput,
  type StockAdjustmentInput,
  type StockMovementInput,
} from "./schema";
