import { DEFAULT_THEME_ID, getTheme } from "./themes";

/**
 * Identidad del producto, centralizada.
 *
 * Cambiar el nombre comercial del sistema debe costar exactamente una edición
 * —aquí o en `themes.ts`—. Ningún componente lo escribe a mano.
 *
 * MIENTRAS DURE LA DEMO el nombre lo pone la dirección visual activa, porque
 * cada una propone el suyo: "Mostrador", "Caja", "Libro". Antes decía "ERP"
 * con el descriptor "Gestión empresarial", que es exactamente el nombre que
 * pondría un generador: describe la categoría, no el producto.
 *
 * Esto es el valor de reserva: lo que se usa donde no se puede saber qué
 * dirección eligió el usuario —los metadatos del documento, que se generan en
 * el servidor y no ven `localStorage`—. En pantalla sí se usa la dirección
 * activa, vía `useBrand()`.
 *
 * Cuando el cliente elija, esto se congela en el nombre elegido y
 * `themes.ts` desaparece.
 */
const PREDETERMINADA = getTheme(DEFAULT_THEME_ID);

export const BRAND = {
  /** Nombre corto que aparece en el título del navegador. */
  name: PREDETERMINADA.marca,
  /** Descriptor que acompaña al nombre en pantallas de acceso. */
  tagline: PREDETERMINADA.descriptor,
  /** Descripción usada en metadatos y en la pantalla de login. */
  description: "Sistema de gestión de ventas, inventario y operación diaria.",
} as const;
