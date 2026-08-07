/**
 * Catálogo de permisos y roles (RBAC).
 *
 * Los permisos son cadenas `recurso:acción`. Los roles guardan una lista de
 * ellos en la columna `Role.permissions`, así que crear un rol nuevo o mover
 * una capacidad entre roles NO requiere migración ni despliegue de esquema.
 *
 * El comodín `recurso:*` concede todas las acciones sobre ese recurso, y `*`
 * concede todo (solo lo usa ADMIN).
 */

export const PERMISSIONS = {
  // Catálogos
  PRODUCTS_READ: "products:read",
  PRODUCTS_WRITE: "products:write",
  PRODUCTS_DELETE: "products:delete",

  CATEGORIES_WRITE: "categories:write",

  CUSTOMERS_READ: "customers:read",
  CUSTOMERS_WRITE: "customers:write",

  SUPPLIERS_READ: "suppliers:read",
  SUPPLIERS_WRITE: "suppliers:write",

  // Operación
  SALES_READ: "sales:read",
  SALES_CREATE: "sales:create",
  /** Cancelar una venta es destructivo: se separa deliberadamente de crearla. */
  SALES_VOID: "sales:void",

  INVENTORY_READ: "inventory:read",
  /** Ajustar existencias sin documento de respaldo. Permiso sensible. */
  INVENTORY_ADJUST: "inventory:adjust",

  PURCHASES_READ: "purchases:read",
  PURCHASES_WRITE: "purchases:write",
  PURCHASES_VOID: "purchases:void",

  EXPENSES_READ: "expenses:read",
  EXPENSES_WRITE: "expenses:write",

  // Análisis y administración
  REPORTS_READ: "reports:read",
  AUDIT_READ: "audit:read",

  USERS_READ: "users:read",
  USERS_WRITE: "users:write",

  SETTINGS_READ: "settings:read",
  SETTINGS_WRITE: "settings:write",

  // Herramientas de la demo
  FEEDBACK_CREATE: "feedback:create",
  FEEDBACK_MANAGE: "feedback:manage",
  DISCOVERY_WRITE: "discovery:write",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Etiquetas legibles para la pantalla de roles. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "products:read": "Ver productos",
  "products:write": "Crear y editar productos",
  "products:delete": "Eliminar productos",
  "categories:write": "Administrar categorías",
  "customers:read": "Ver clientes",
  "customers:write": "Crear y editar clientes",
  "suppliers:read": "Ver proveedores",
  "suppliers:write": "Crear y editar proveedores",
  "sales:read": "Ver ventas",
  "sales:create": "Registrar ventas",
  "sales:void": "Cancelar ventas",
  "inventory:read": "Ver inventario",
  "inventory:adjust": "Ajustar inventario",
  "purchases:read": "Ver compras",
  "purchases:write": "Registrar compras",
  "purchases:void": "Cancelar compras",
  "expenses:read": "Ver gastos",
  "expenses:write": "Registrar gastos",
  "reports:read": "Consultar reportes",
  "audit:read": "Consultar bitácora de auditoría",
  "users:read": "Ver usuarios",
  "users:write": "Administrar usuarios",
  "settings:read": "Ver configuración",
  "settings:write": "Modificar configuración",
  "feedback:create": "Dejar feedback",
  "feedback:manage": "Administrar feedback",
  "discovery:write": "Responder el cuestionario",
};

export const ROLE_KEYS = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  EMPLOYEE: "EMPLOYEE",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

/**
 * Roles que crea el seed.
 *
 * - ADMIN    : dueño del sistema. Todo.
 * - MANAGER  : encargado de tienda. Opera y consulta, pero no toca usuarios
 *              ni configuración fiscal.
 * - EMPLOYEE : cajero. Vende y consulta lo mínimo. No cancela, no ajusta
 *              inventario, no ve reportes de rentabilidad.
 */
export const DEFAULT_ROLES: Record<
  RoleKey,
  { name: string; description: string; permissions: string[] }
> = {
  ADMIN: {
    name: "Administrador",
    description: "Acceso total al sistema y a la configuración.",
    permissions: ["*"],
  },
  MANAGER: {
    name: "Encargado",
    description:
      "Opera el negocio: vende, compra, ajusta inventario y consulta reportes.",
    permissions: [
      PERMISSIONS.PRODUCTS_READ,
      PERMISSIONS.PRODUCTS_WRITE,
      PERMISSIONS.CATEGORIES_WRITE,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_WRITE,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.SUPPLIERS_WRITE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_VOID,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_ADJUST,
      PERMISSIONS.PURCHASES_READ,
      PERMISSIONS.PURCHASES_WRITE,
      PERMISSIONS.PURCHASES_VOID,
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.EXPENSES_WRITE,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.SETTINGS_READ,
      PERMISSIONS.FEEDBACK_CREATE,
      PERMISSIONS.FEEDBACK_MANAGE,
      PERMISSIONS.DISCOVERY_WRITE,
    ],
  },
  EMPLOYEE: {
    name: "Cajero",
    description: "Registra ventas y consulta productos y clientes.",
    permissions: [
      PERMISSIONS.PRODUCTS_READ,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_WRITE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.EXPENSES_WRITE,
      PERMISSIONS.FEEDBACK_CREATE,
    ],
  },
};

/**
 * Evalúa si un conjunto de permisos concede el permiso solicitado.
 *
 * Función pura y sin dependencias: la usan por igual el servidor (para
 * autorizar de verdad) y el cliente (para ocultar botones). La autorización
 * real siempre ocurre en el servidor; ocultar en el cliente es solo cortesía
 * visual.
 */
export function hasPermission(
  granted: readonly string[],
  required: string,
): boolean {
  if (granted.includes("*")) return true;
  if (granted.includes(required)) return true;

  const [resource] = required.split(":");
  return granted.includes(`${resource}:*`);
}

/** Verdadero solo si se conceden TODOS los permisos indicados. */
export function hasAllPermissions(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((permission) => hasPermission(granted, permission));
}

/** Verdadero si se concede AL MENOS UNO. */
export function hasAnyPermission(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  return required.some((permission) => hasPermission(granted, permission));
}
