/**
 * Identidad del producto, centralizada.
 *
 * Cambiar el nombre comercial del sistema debe costar exactamente una edición
 * en este archivo. Ningún componente debe escribir el nombre a mano.
 */
export const BRAND = {
  /** Nombre corto que aparece en la barra lateral y el título del navegador. */
  name: "ERP",
  /** Descriptor que acompaña al nombre en pantallas de acceso. */
  tagline: "Gestión empresarial",
  /** Descripción usada en metadatos y en la pantalla de login. */
  description: "Sistema de gestión de ventas, inventario y operación diaria.",
} as const;
