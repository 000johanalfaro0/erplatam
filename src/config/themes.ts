/**
 * TRES DIRECCIONES VISUALES
 * ===========================================================================
 * El cliente elige en vivo con un conmutador. Cuando decida, se consolida la
 * elegida y se retiran las otras dos.
 *
 * POR QUÉ ESTA ES LA SEGUNDA VERSIÓN
 * La primera cambiaba color, tipografía, esquinas y densidad, y dejaba la
 * pantalla exactamente igual: misma barra lateral, misma cabecera, mismas
 * tarjetas en el mismo sitio. El cliente lo dijo sin rodeos —"solo cambia
 * colores y tipografías"— y tenía razón: eso no es elegir entre tres
 * diseños, es elegir entre tres paletas. También dijo que las tipografías
 * eran poco serias, y también tenía razón: una grotesca de display y una
 * monoespaciada no son letras para una herramienta de trabajo.
 *
 * Ahora cada dirección cambia LA ESTRUCTURA:
 *
 *   · dónde vive la navegación
 *   · si el contenido va a sangre o centrado con margen
 *   · si hay tarjetas o bloques planos separados por líneas
 *   · si la cabecera es un bloque con título grande o una barra de una línea
 *   · si hay barra de estado abajo
 *
 * Y las tres tipografías son de trabajo: Public Sans (la del sistema de
 * diseño del gobierno de EE. UU.), IBM Plex Sans (heredera de la tipografía
 * corporativa de IBM) y Geist. Ninguna llama la atención sobre sí misma.
 *
 * CÓMO ESTÁ REPARTIDO EL TRABAJO
 * La navegación se ramifica en JSX porque son tres árboles distintos. Todo
 * lo demás —cabeceras, superficies, densidad, ancho— se resuelve en CSS con
 * selectores `:root[data-direccion="…"]`. Así las once pantallas no se
 * tocan: siguen usando `PageHeader` y `Card` como siempre, y es el CSS el
 * que decide cómo se ven. Cambiar de dirección no puede romper una pantalla
 * porque ninguna pantalla sabe qué dirección está activa.
 */

export type Estructura = "lateral" | "superior" | "carril";

export interface Theme {
  id: string;
  /** Nombre de la dirección, para el conmutador de la demo. */
  nombre: string;
  /** Qué apuesta hace y para quién. Se muestra al elegir. */
  apuesta: string;
  /** En qué se nota, dicho en una línea. */
  estructuraDescrita: string;
  /** Dónde vive la navegación. Es lo único que se ramifica en JSX. */
  estructura: Estructura;
  /** Nombre del producto en esta dirección. */
  marca: string;
  /** Descriptor bajo el nombre. */
  descriptor: string;
  /** Icono: SVG inline. */
  icono: string;
  /** Acento, solo para la muestra de color del conmutador. */
  muestra: string;
}

export const THEMES: Theme[] = [
  // -------------------------------------------------------------------------
  {
    id: "tablero",
    muestra: "oklch(30% 0.014 260)",
    nombre: "Tablero",
    apuesta:
      "Máxima información por pantalla. Para quien pasa el día aquí y necesita ver mucho de un vistazo.",
    estructuraDescrita:
      "Menú lateral · contenido a sangre, sin tarjetas · barra de estado abajo",
    estructura: "lateral",
    marca: "ERPLatam",
    descriptor: "Control de operación multipaís",
    /* Rejilla de celdas: lo que se ve al abrirlo. */
    icono: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18"/><path d="M9 9.5V20"/></svg>`,
  },

  // -------------------------------------------------------------------------
  {
    id: "barra",
    muestra: "oklch(45% 0.085 165)",
    nombre: "Barra",
    apuesta:
      "Se parece a un programa de escritorio de toda la vida. Para quien viene de uno y no quiere reaprender dónde está todo.",
    estructuraDescrita:
      "Menú arriba, sin barra lateral · el contenido gana 240 px de ancho",
    estructura: "superior",
    marca: "ERPLatam",
    descriptor: "Administración para Latinoamérica",
    /* Un edificio de comercio: fachada con toldo. */
    icono: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"/><path d="M2.5 10 4.2 5.3A1 1 0 0 1 5.14 4.6h13.72a1 1 0 0 1 .94.7L21.5 10Z"/><path d="M9.5 20v-5.5h5V20"/></svg>`,
  },

  // -------------------------------------------------------------------------
  {
    id: "carril",
    muestra: "oklch(48% 0.14 278)",
    nombre: "Carril",
    apuesta:
      "Tranquila y con aire. Para quien entra unas veces al día a mirar cómo va y no quiere sentirse en una cabina de mando.",
    estructuraDescrita:
      "Carril de iconos de 60 px · contenido centrado con margen · tarjetas",
    estructura: "carril",
    marca: "ERPLatam",
    descriptor: "Ventas, inventario y cuentas",
    /* Capas apiladas: el libro mayor de movimientos, que es el corazón. */
    icono: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/></svg>`,
  },
];

export const THEME_STORAGE_KEY = "erp-direccion-visual";

/** Dirección por defecto mientras el cliente no elige. */
export const DEFAULT_THEME_ID = "tablero";

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
