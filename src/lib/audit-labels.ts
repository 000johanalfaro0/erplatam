import { AUDIT_ACTIONS } from "@/server/core/audit";

/**
 * Traducción de los verbos de la bitácora a español llano.
 *
 * La bitácora guarda `sale.create` porque es estable, filtrable y no depende
 * del idioma. El usuario lee "registró una venta". Los datos se guardan para
 * la máquina y se presentan para la persona.
 *
 * Vive en un módulo propio, y no dentro de la pantalla que lo usa, por dos
 * motivos: lo consumen el panel y la pantalla de auditoría, y así se puede
 * comprobar con un test que no falte ninguno.
 */
export const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "inició sesión",
  "auth.login_failed": "falló al iniciar sesión",
  "auth.logout": "cerró sesión",

  "product.create": "dio de alta un producto",
  "product.update": "editó un producto",
  "product.delete": "eliminó un producto",

  "category.create": "creó una categoría",
  "category.update": "editó una categoría",
  "category.delete": "eliminó una categoría",

  "customer.create": "dio de alta un cliente",
  "customer.update": "editó un cliente",
  "customer.delete": "eliminó un cliente",

  "supplier.create": "dio de alta un proveedor",
  "supplier.update": "editó un proveedor",
  "supplier.delete": "eliminó un proveedor",

  "sale.create": "registró una venta",
  "sale.void": "canceló una venta",

  "purchase.create": "registró una compra",
  "purchase.void": "canceló una compra",

  "inventory.adjust": "ajustó el inventario",
  "inventory.entry": "registró una entrada de mercancía",
  "inventory.exit": "registró una salida de mercancía",

  "expense.create": "registró un gasto",
  "expense.update": "modificó un gasto",
  "expense.delete": "eliminó un gasto",

  "user.create": "creó un usuario",
  "user.update": "modificó un usuario",
  "user.deactivate": "desactivó un usuario",

  "settings.update": "cambió la configuración",

  "feedback.create": "dejó una anotación",
  "feedback.update": "actualizó una anotación",

  "discovery.submit": "respondió el cuestionario",
};

/**
 * Describe una acción de la bitácora.
 *
 * Si el verbo no está traducido se devuelve tal cual, en lugar de ocultar la
 * fila: perder una entrada de la bitácora es peor que mostrarla fea.
 */
export function describeAuditAction(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

/** Acciones que conviene resaltar en la bitácora por ser sensibles. */
export const SENSITIVE_ACTIONS: ReadonlySet<string> = new Set([
  AUDIT_ACTIONS.SALE_VOID,
  AUDIT_ACTIONS.PURCHASE_VOID,
  AUDIT_ACTIONS.INVENTORY_ADJUST,
  AUDIT_ACTIONS.PRODUCT_DELETE,
  AUDIT_ACTIONS.EXPENSE_DELETE,
  AUDIT_ACTIONS.USER_DEACTIVATE,
  AUDIT_ACTIONS.SETTINGS_UPDATE,
  AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
]);
