/**
 * Verbos de la bitácora de auditoría.
 *
 * POR QUÉ ESTÁN EN SU PROPIO ARCHIVO, separados de `audit.ts`
 * ---------------------------------------------------------------------------
 * Este módulo es PURO: no importa base de datos, ni Prisma, ni nada. Solo
 * constantes.
 *
 * `audit.ts` sí importa el cliente de base de datos, porque escribe. Cuando la
 * interfaz necesitaba traducir un verbo a español e importaba las constantes
 * desde ahí, arrastraba consigo TODO el grafo: audit → db → adaptador de
 * Prisma → cliente de Prisma. En un componente `"use client"` eso mete Prisma
 * en el bundle del navegador.
 *
 * El síntoma no fue un error de tipos —compilaba perfectamente— sino un 500 al
 * abrir la pantalla de auditoría. Separar las constantes puras corta la cadena
 * de raíz.
 *
 * Regla general: si un valor lo necesitan el servidor Y el cliente, vive en un
 * módulo sin dependencias.
 */

export const AUDIT_ACTIONS = {
  AUTH_LOGIN: "auth.login",
  AUTH_LOGIN_FAILED: "auth.login_failed",
  AUTH_LOGOUT: "auth.logout",

  PRODUCT_CREATE: "product.create",
  PRODUCT_UPDATE: "product.update",
  PRODUCT_DELETE: "product.delete",

  CATEGORY_CREATE: "category.create",
  CATEGORY_UPDATE: "category.update",
  CATEGORY_DELETE: "category.delete",

  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_UPDATE: "customer.update",
  CUSTOMER_DELETE: "customer.delete",

  SUPPLIER_CREATE: "supplier.create",
  SUPPLIER_UPDATE: "supplier.update",
  SUPPLIER_DELETE: "supplier.delete",

  SALE_CREATE: "sale.create",
  SALE_VOID: "sale.void",

  PURCHASE_CREATE: "purchase.create",
  PURCHASE_VOID: "purchase.void",

  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_ENTRY: "inventory.entry",
  INVENTORY_EXIT: "inventory.exit",

  EXPENSE_CREATE: "expense.create",
  EXPENSE_UPDATE: "expense.update",
  EXPENSE_DELETE: "expense.delete",

  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_DEACTIVATE: "user.deactivate",

  SETTINGS_UPDATE: "settings.update",

  FEEDBACK_CREATE: "feedback.create",
  FEEDBACK_UPDATE: "feedback.update",

  DISCOVERY_SUBMIT: "discovery.submit",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
