import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases de Tailwind resolviendo conflictos.
 *
 * `cn("px-2", "px-4")` devuelve `"px-4"`, no ambas. Sin esto, las props de
 * `className` de los componentes no podrían sobrescribir los estilos por
 * defecto de forma fiable.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
