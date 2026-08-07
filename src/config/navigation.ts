import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  MessageSquareDot,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PERMISSIONS } from "@/server/core/permissions";

/**
 * Estructura de navegación, declarada en un único lugar.
 *
 * Añadir un módulo al menú es agregar una entrada aquí: la barra lateral, la
 * búsqueda global y el tutorial guiado leen todos de esta misma fuente. Sin
 * ella, un módulo nuevo aparecería en el menú pero no en la búsqueda, que es
 * el tipo de inconsistencia que delata software mal ensamblado.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permiso mínimo para ver la entrada. Sin él, no se dibuja. */
  permission?: string;
  /** Términos extra que debe reconocer la búsqueda global. */
  keywords?: string[];
  /** Identificador estable para anclar pasos del tutorial. */
  tourId?: string;
}

export interface NavSection {
  label: string | null;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    label: null,
    items: [
      {
        href: "/",
        label: "Panel",
        icon: LayoutDashboard,
        keywords: ["dashboard", "inicio", "resumen"],
        tourId: "nav-dashboard",
      },
    ],
  },
  {
    label: "Operación",
    items: [
      {
        href: "/ventas",
        label: "Ventas",
        icon: ShoppingCart,
        permission: PERMISSIONS.SALES_READ,
        keywords: ["vender", "cobrar", "punto de venta", "caja", "ticket"],
        tourId: "nav-sales",
      },
      {
        href: "/inventario",
        label: "Inventario",
        icon: Boxes,
        permission: PERMISSIONS.INVENTORY_READ,
        keywords: ["productos", "stock", "existencias", "almacén", "kardex"],
        tourId: "nav-inventory",
      },
      {
        href: "/compras",
        label: "Compras",
        icon: Truck,
        permission: PERMISSIONS.PURCHASES_READ,
        keywords: ["proveedor", "abastecer", "entrada", "pedido"],
        tourId: "nav-purchases",
      },
      {
        href: "/gastos",
        label: "Gastos",
        icon: Wallet,
        permission: PERMISSIONS.EXPENSES_READ,
        keywords: ["egresos", "renta", "servicios", "nómina"],
        tourId: "nav-expenses",
      },
    ],
  },
  {
    label: "Directorio",
    items: [
      {
        href: "/clientes",
        label: "Clientes",
        icon: Users,
        permission: PERMISSIONS.CUSTOMERS_READ,
        keywords: ["compradores", "rfc", "cartera"],
        tourId: "nav-customers",
      },
      {
        href: "/proveedores",
        label: "Proveedores",
        icon: ClipboardList,
        permission: PERMISSIONS.SUPPLIERS_READ,
        keywords: ["surtidores", "abastecedores"],
      },
    ],
  },
  {
    label: "Análisis",
    items: [
      {
        href: "/reportes",
        label: "Reportes",
        icon: BarChart3,
        permission: PERMISSIONS.REPORTS_READ,
        keywords: ["informes", "estadísticas", "corte", "exportar"],
        tourId: "nav-reports",
      },
      {
        href: "/auditoria",
        label: "Auditoría",
        icon: Receipt,
        permission: PERMISSIONS.AUDIT_READ,
        keywords: ["bitácora", "historial", "log", "trazabilidad"],
      },
    ],
  },
  {
    label: "Demo",
    items: [
      {
        href: "/feedback",
        label: "Feedback",
        icon: MessageSquareDot,
        permission: PERMISSIONS.FEEDBACK_CREATE,
        keywords: ["comentarios", "observaciones", "anotaciones"],
        tourId: "nav-feedback",
      },
      {
        href: "/configuracion",
        label: "Configuración",
        icon: Settings,
        permission: PERMISSIONS.SETTINGS_READ,
        keywords: [
          "ajustes",
          "impuestos",
          "iva",
          "negocio",
          "usuarios",
          "cuestionario",
          "análisis del negocio",
        ],
        tourId: "nav-settings",
      },
    ],
  },
];

/** Lista plana, útil para la búsqueda global. */
export const ALL_NAV_ITEMS: NavItem[] = NAVIGATION.flatMap(
  (section) => section.items,
);
