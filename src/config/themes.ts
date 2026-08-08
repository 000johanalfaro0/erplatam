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
  /** Familia tipográfica principal. */
  fuente: string;
  /** Variables CSS que sobrescriben las de globals.css. */
  tokens: Record<string, string>;
}

export const THEMES: Theme[] = [
  // -------------------------------------------------------------------------
  {
    id: "tablero",
    nombre: "Tablero",
    apuesta:
      "Máxima información por pantalla. Para quien pasa el día aquí y necesita ver mucho de un vistazo.",
    estructuraDescrita:
      "Menú lateral · contenido a sangre, sin tarjetas · barra de estado abajo",
    estructura: "lateral",
    marca: "Demo",
    descriptor: "Control de operación",
    /* Rejilla de celdas: lo que se ve al abrirlo. */
    icono: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18"/><path d="M9 9.5V20"/></svg>`,
    fuente: `var(--font-public-sans), system-ui, sans-serif`,
    tokens: {
      /* Grafito. El acento no decora: aquí manda la información, y un color
         saturado en cada botón compite con las cifras de la tabla. */
      "--color-accent": "oklch(30% 0.014 260)",
      "--color-accent-hover": "oklch(22% 0.014 260)",
      "--color-accent-soft": "oklch(94% 0.006 260)",
      "--color-accent-ink": "oklch(100% 0 0)",

      "--color-canvas": "oklch(100% 0 0)",
      "--color-surface": "oklch(100% 0 0)",
      "--color-surface-sunken": "oklch(97.5% 0.002 260)",
      "--color-ink": "oklch(19% 0.008 260)",
      "--color-ink-muted": "oklch(46% 0.008 260)",
      "--color-line": "oklch(91% 0.003 260)",
      "--color-line-strong": "oklch(83% 0.005 260)",

      "--radius-xs": "0.125rem",
      "--radius-sm": "0.1875rem",
      "--radius-md": "0.25rem",
      "--radius-lg": "0.25rem",

      /* Sin margen: la tabla llega al borde de la ventana. */
      "--ancho-contenido": "100%",
      "--margen-contenido": "0rem",
      "--respiro-contenido": "0rem",
      "--densidad-fila": "2.375rem",
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "barra",
    nombre: "Barra",
    apuesta:
      "Se parece a un programa de escritorio de toda la vida. Para quien viene de uno y no quiere reaprender dónde está todo.",
    estructuraDescrita:
      "Menú arriba, sin barra lateral · el contenido gana 240 px de ancho",
    estructura: "superior",
    marca: "Demo",
    descriptor: "Administración del negocio",
    /* Un edificio de comercio: fachada con toldo. */
    icono: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"/><path d="M2.5 10 4.2 5.3A1 1 0 0 1 5.14 4.6h13.72a1 1 0 0 1 .94.7L21.5 10Z"/><path d="M9.5 20v-5.5h5V20"/></svg>`,
    fuente: `var(--font-plex), system-ui, sans-serif`,
    tokens: {
      /* Verde pino: institucional sin ser corporativo genérico. */
      "--color-accent": "oklch(45% 0.085 165)",
      "--color-accent-hover": "oklch(39% 0.085 165)",
      "--color-accent-soft": "oklch(95% 0.024 165)",
      "--color-accent-ink": "oklch(100% 0 0)",

      "--color-canvas": "oklch(97% 0.004 200)",
      "--color-surface": "oklch(100% 0 0)",
      "--color-surface-sunken": "oklch(96% 0.005 200)",
      "--color-ink": "oklch(21% 0.01 210)",
      "--color-ink-muted": "oklch(47% 0.01 210)",
      "--color-line": "oklch(90% 0.005 200)",
      "--color-line-strong": "oklch(82% 0.008 200)",

      "--radius-xs": "0.1875rem",
      "--radius-sm": "0.25rem",
      "--radius-md": "0.375rem",
      "--radius-lg": "0.5rem",

      "--ancho-contenido": "100%",
      "--margen-contenido": "1.25rem",
      "--respiro-contenido": "1.25rem",
      "--densidad-fila": "2.75rem",
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "carril",
    nombre: "Carril",
    apuesta:
      "Tranquila y con aire. Para quien entra unas veces al día a mirar cómo va y no quiere sentirse en una cabina de mando.",
    estructuraDescrita:
      "Carril de iconos de 60 px · contenido centrado con margen · tarjetas",
    estructura: "carril",
    marca: "Demo",
    descriptor: "Ventas, inventario y cuentas",
    /* Capas apiladas: el libro mayor de movimientos, que es el corazón. */
    icono: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/></svg>`,
    fuente: `var(--font-geist), system-ui, sans-serif`,
    tokens: {
      /* Índigo profundo. No es el azul por defecto de Tailwind: está más
         cerca del violeta y bastante más apagado. */
      "--color-accent": "oklch(48% 0.14 278)",
      "--color-accent-hover": "oklch(42% 0.14 278)",
      "--color-accent-soft": "oklch(95% 0.028 278)",
      "--color-accent-ink": "oklch(100% 0 0)",

      "--color-canvas": "oklch(98% 0.004 275)",
      "--color-surface": "oklch(100% 0 0)",
      "--color-surface-sunken": "oklch(96.5% 0.006 275)",
      "--color-ink": "oklch(22% 0.012 275)",
      "--color-ink-muted": "oklch(49% 0.012 275)",
      "--color-line": "oklch(91% 0.006 275)",
      "--color-line-strong": "oklch(84% 0.009 275)",

      "--radius-xs": "0.25rem",
      "--radius-sm": "0.375rem",
      "--radius-md": "0.625rem",
      "--radius-lg": "0.875rem",

      /* Centrado y con margen: se lee, no se escanea. */
      "--ancho-contenido": "1080px",
      "--margen-contenido": "2rem",
      "--respiro-contenido": "2rem",
      "--densidad-fila": "3rem",
    },
  },
];

export const THEME_STORAGE_KEY = "erp-direccion-visual";

/** Dirección por defecto mientras el cliente no elige. */
export const DEFAULT_THEME_ID = "tablero";

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
