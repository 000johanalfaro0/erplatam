/**
 * ANCLAJE DE ANOTACIONES A ELEMENTOS
 * ===========================================================================
 * El problema central de una capa de anotaciones: una nota escrita hoy sobre
 * el botón "Cobrar" tiene que reencontrar ESE botón mañana, aunque la tabla
 * tenga otras filas, la ventana tenga otro tamaño o el componente se haya
 * vuelto a renderizar.
 *
 * Guardar coordenadas no sirve: el elemento se mueve. Guardar un selector CSS
 * tipo `div > div:nth-child(3) > button` tampoco: cualquier cambio de maqueta
 * lo rompe, y son justo los cambios que el feedback provoca.
 *
 * ESTRATEGIA: varias señales, de más a menos estable, y se guardan TODAS. Al
 * resolver se prueban en orden y gana la primera que encuentre un elemento
 * único. Así una anotación sobrevive a que cambie el texto de un botón (queda
 * el data-anchor) o a que se renombre un atributo (queda el nombre accesible).
 */

export interface ElementAnchor {
  /** Marcador explícito `data-anchor`. La señal más estable. */
  anchorId?: string;
  /** Identificador de paso del tutorial. También estable. */
  tourId?: string;
  /** Rol ARIA + nombre accesible: `button` + "Cobrar". */
  role?: string;
  name?: string;
  /** Etiqueta HTML, para desempatar. */
  tag?: string;
  /** Posición entre elementos hermanos idénticos. */
  index?: number;
  /** Ruta CSS aproximada. Último recurso. */
  path?: string;
  /** Descripción legible para mostrar en la anotación. */
  label: string;
}

/** Elementos que tiene sentido anotar; se ignora el resto al hacer clic. */
const INTERACTIVOS =
  "button, a, input, select, textarea, [role='button'], th, td, h1, h2, h3, label, li";

/**
 * Nombre accesible de un elemento, siguiendo el orden que usaría un lector de
 * pantalla. Es la señal más útil para un humano y también bastante estable:
 * el texto de un botón cambia mucho menos que su posición en el DOM.
 */
function nombreAccesible(el: HTMLElement): string {
  return (
    el.getAttribute("aria-label") ??
    el.getAttribute("placeholder") ??
    el.getAttribute("title") ??
    el.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ??
    ""
  );
}

function rolDe(el: HTMLElement): string {
  const explicito = el.getAttribute("role");
  if (explicito) return explicito;

  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button") return "button";
  if (tag === "input") return el.getAttribute("type") ?? "textbox";
  if (/^h[1-6]$/.test(tag)) return "heading";
  return tag;
}

/** Ruta CSS corta y legible. Solo se usa si todo lo demás falla. */
function rutaCss(el: HTMLElement): string {
  const partes: string[] = [];
  let actual: HTMLElement | null = el;
  let profundidad = 0;

  while (actual && actual !== document.body && profundidad < 5) {
    const tag = actual.tagName.toLowerCase();
    const padre: HTMLElement | null = actual.parentElement;

    if (padre) {
      const hermanos = [...padre.children].filter(
        (h) => h.tagName === actual!.tagName,
      );
      const posicion = hermanos.indexOf(actual) + 1;
      partes.unshift(hermanos.length > 1 ? `${tag}:nth-of-type(${posicion})` : tag);
    } else {
      partes.unshift(tag);
    }

    actual = padre;
    profundidad++;
  }

  return partes.join(" > ");
}

/**
 * Construye el ancla de un elemento.
 *
 * Sube al ancestro interactivo más cercano: si se hace clic en el texto de un
 * botón, se ancla al botón, no al `<span>` interior. Es lo que la persona
 * quiso señalar.
 */
export function crearAncla(target: HTMLElement): ElementAnchor {
  const el = (target.closest(INTERACTIVOS) as HTMLElement | null) ?? target;

  const name = nombreAccesible(el);
  const role = rolDe(el);
  const tag = el.tagName.toLowerCase();

  // Posición entre elementos con el mismo rol y nombre, por si hay varios
  // iguales (celdas de una tabla, botones repetidos por fila).
  const candidatos = [...document.querySelectorAll<HTMLElement>(INTERACTIVOS)].filter(
    (c) => rolDe(c) === role && nombreAccesible(c) === name,
  );
  const index = candidatos.indexOf(el);

  const etiquetaTipo =
    role === "button"
      ? "Botón"
      : role === "link"
        ? "Enlace"
        : role === "heading"
          ? "Título"
          : tag === "input" || tag === "select" || tag === "textarea"
            ? "Campo"
            : tag === "td" || tag === "th"
              ? "Celda"
              : "Elemento";

  return {
    anchorId: el.dataset.anchor,
    tourId: el.dataset.tour,
    role,
    name: name || undefined,
    tag,
    index: index >= 0 ? index : undefined,
    path: rutaCss(el),
    label: name ? `${etiquetaTipo} “${name}”` : etiquetaTipo,
  };
}

/**
 * Encuentra el elemento de un ancla. Devuelve null si ya no existe.
 *
 * Prueba las señales de más a menos estable y se queda con la primera que
 * localice algo. Que devuelva null es información válida, no un error: la
 * pantalla pudo cambiar, y la interfaz debe mostrar esa anotación como
 * "huérfana" en lugar de colocarla en un sitio equivocado.
 */
export function resolverAncla(ancla: ElementAnchor): HTMLElement | null {
  // 1. Marcador explícito.
  if (ancla.anchorId) {
    const el = document.querySelector<HTMLElement>(
      `[data-anchor="${CSS.escape(ancla.anchorId)}"]`,
    );
    if (el) return el;
  }

  // 2. Identificador de tutorial.
  if (ancla.tourId) {
    const el = document.querySelector<HTMLElement>(
      `[data-tour="${CSS.escape(ancla.tourId)}"]`,
    );
    if (el) return el;
  }

  // 3. Rol + nombre accesible. La señal más robusta ante cambios de maqueta,
  //    porque describe QUÉ es el elemento y no DÓNDE está.
  if (ancla.role && ancla.name) {
    const candidatos = [
      ...document.querySelectorAll<HTMLElement>(INTERACTIVOS),
    ].filter(
      (c) => rolDe(c) === ancla.role && nombreAccesible(c) === ancla.name,
    );

    if (candidatos.length === 1) return candidatos[0];

    // Varios iguales: se usa la posición guardada.
    if (candidatos.length > 1 && ancla.index !== undefined) {
      return candidatos[ancla.index] ?? candidatos[0];
    }

    if (candidatos.length > 1) return candidatos[0];
  }

  // 4. Ruta CSS. Frágil, pero mejor que perder la anotación.
  if (ancla.path) {
    try {
      const el = document.querySelector<HTMLElement>(ancla.path);
      if (el) return el;
    } catch {
      // Ruta inválida tras un cambio de maqueta.
    }
  }

  return null;
}

/** Serializa para guardar en base de datos. */
export function serializarAncla(ancla: ElementAnchor): string {
  return JSON.stringify(ancla);
}

/** Deserializa. Devuelve null si el dato guardado no es un ancla válida. */
export function deserializarAncla(texto: string | null): ElementAnchor | null {
  if (!texto) return null;
  try {
    const dato = JSON.parse(texto) as ElementAnchor;
    return typeof dato === "object" && dato !== null && "label" in dato
      ? dato
      : null;
  } catch {
    return null;
  }
}
