/**
 * TRES DIRECCIONES VISUALES
 * ===========================================================================
 * El cliente elige en vivo durante la demo, con un conmutador. Cuando decida,
 * se consolida la elegida y se retiran las otras dos.
 *
 * SON DELIBERADAMENTE DISTINTAS. Tres variaciones del mismo tono no serían una
 * elección real: el cliente diría "cualquiera" y no habríamos aprendido nada.
 * Cada una apuesta por algo diferente y asume el coste de esa apuesta.
 *
 * QUÉ SE CAMBIA Y POR QUÉ ESO
 * Lo que hacía que el diseño anterior se sintiera generado por IA no era un
 * detalle, era la ausencia de punto de vista:
 *
 *   · acento #2563eb — el azul por defecto de Tailwind, el más repetido
 *   · Inter en todo — la tipografía por defecto de todo panel desde 2020
 *   · todo en tarjetas con el mismo radio y la misma sombra
 *   · densidad baja para lo que es una herramienta de trabajo
 *   · nombre "ERP" e icono con la letra inicial en un cuadrado
 *
 * Cada dirección corrige las cinco cosas a la vez, en una dirección concreta.
 *
 * IMPLEMENTACIÓN: solo se sobrescriben variables CSS y tres constantes de
 * marca. Ningún componente sabe qué dirección está activa, así que cambiar de
 * una a otra no puede romper nada.
 */

export interface Theme {
  id: string;
  /** Nombre de la dirección, para el conmutador de la demo. */
  nombre: string;
  /** Qué apuesta hace y para quién. Se muestra al elegir. */
  apuesta: string;
  /** Nombre del producto en esta dirección. */
  marca: string;
  /** Descriptor bajo el nombre. */
  descriptor: string;
  /** Icono: SVG inline, sin la letra inicial en un cuadrado. */
  icono: string;
  /** Familia tipográfica principal. */
  fuente: string;
  /** Variables CSS que sobrescriben las de globals.css. */
  tokens: Record<string, string>;
}

export const THEMES: Theme[] = [
  // -------------------------------------------------------------------------
  {
    id: "mostrador",
    nombre: "Mostrador",
    apuesta:
      "Cálida y cercana. Para que quien nunca usó un sistema no le tenga miedo.",
    marca: "Mostrador",
    descriptor: "Tu negocio, al día",
    /* Un toldo de mercado. Concreto, del oficio, sin caricatura. */
    icono: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18l-1.5-4.5A1 1 0 0 0 18.55 4H5.45a1 1 0 0 0-.95.5L3 9Z"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 9v3a3 3 0 0 0 6 0V9"/></svg>`,
    fuente: `var(--font-bricolage), var(--font-inter), system-ui, sans-serif`,
    tokens: {
      /* Terracota quemada: cálida sin ser naranja de aviso. */
      "--color-accent": "oklch(56% 0.15 42)",
      "--color-accent-hover": "oklch(50% 0.15 42)",
      "--color-accent-soft": "oklch(96% 0.028 55)",
      "--color-accent-ink": "oklch(100% 0 0)",

      /* Fondo con un punto de calidez, no gris azulado. */
      "--color-canvas": "oklch(98.5% 0.006 70)",
      "--color-surface": "oklch(100% 0 0)",
      "--color-surface-sunken": "oklch(97% 0.008 70)",
      "--color-ink": "oklch(24% 0.015 50)",
      "--color-ink-muted": "oklch(52% 0.012 50)",
      "--color-line": "oklch(92% 0.008 60)",
      "--color-line-strong": "oklch(86% 0.012 60)",

      /* Radios generosos: se percibe amable, no severo. */
      "--radius-sm": "0.5rem",
      "--radius-md": "0.75rem",
      "--radius-lg": "1rem",

      /* Filas altas: se lee sin esfuerzo. Menos datos por pantalla, a cambio
         de que nadie se pierda. */
      "--densidad-fila": "3.25rem",
      "--densidad-texto": "14px",
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "caja",
    nombre: "Caja",
    apuesta:
      "Densa y rápida. Para quien pasa ocho horas aquí y quiere ver todo de un vistazo.",
    marca: "Caja",
    descriptor: "Punto de venta",
    /* Un cajón de dinero visto de frente. */
    icono: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="7" width="19" height="12" rx="1.5"/><path d="M2.5 11h19"/><path d="M9.5 15h5"/><path d="M6 7V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V7"/></svg>`,
    fuente: `ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace`,
    tokens: {
      /* Verde terminal, no el azul de siempre. */
      "--color-accent": "oklch(58% 0.13 165)",
      "--color-accent-hover": "oklch(52% 0.13 165)",
      "--color-accent-soft": "oklch(95% 0.03 165)",
      "--color-accent-ink": "oklch(100% 0 0)",

      "--color-canvas": "oklch(97.5% 0.003 240)",
      "--color-surface": "oklch(100% 0 0)",
      "--color-surface-sunken": "oklch(96% 0.004 240)",
      "--color-ink": "oklch(20% 0.01 250)",
      "--color-ink-muted": "oklch(48% 0.01 250)",
      "--color-line": "oklch(90% 0.004 240)",
      "--color-line-strong": "oklch(82% 0.006 240)",

      /* Esquinas casi rectas: herramienta, no aplicación de consumo. */
      "--radius-xs": "0.125rem",
      "--radius-sm": "0.1875rem",
      "--radius-md": "0.25rem",
      "--radius-lg": "0.3125rem",

      /* Filas compactas: caben treinta productos donde antes diez. */
      "--densidad-fila": "2.25rem",
      "--densidad-texto": "12.5px",
    },
  },

  // -------------------------------------------------------------------------
  {
    id: "libro",
    nombre: "Libro",
    apuesta:
      "Sobria y formal. Transmite que aquí se guardan cuentas serias.",
    marca: "Libro",
    descriptor: "Registro y control del negocio",
    /* Un libro de cuentas abierto. Enlaza con el libro mayor de inventario. */
    icono: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10.5 5 8.5 4.5 5 4.5A1.5 1.5 0 0 0 3.5 6v11A1.5 1.5 0 0 0 5 18.5c3.5 0 5.5.5 7 2 1.5-1.5 3.5-2 7-2a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 19 4.5c-3.5 0-5.5.5-7 2Z"/><path d="M12 6.5v14"/></svg>`,
    /* Source Serif 4 y no una serifa de display: tiene pesos reales para las
       cabeceras de tabla y cifras alineadas. Georgia, que era la alternativa
       obvia, usa cifras de estilo antiguo —el 3 y el 9 bajan de la línea base—
       y en una columna de dinero eso se lee como un error de renderizado. */
    fuente: `var(--font-serif-libro), Georgia, "Times New Roman", serif`,
    tokens: {
      /* Tinta. Literalmente: el acento es el mismo negro con que se escribe.
         Antes era verde contable, pero puesto al lado de "Caja" las dos se
         leían como "el sistema verde" y la elección dejaba de ser una
         elección. Aquí el color no decora: lo que distingue esta dirección
         es la tipografía con serifa, el papel y la ausencia de redondeo. */
      "--color-accent": "oklch(26% 0.018 70)",
      "--color-accent-hover": "oklch(18% 0.018 70)",
      "--color-accent-soft": "oklch(93% 0.012 80)",
      "--color-accent-ink": "oklch(100% 0 0)",

      /* Papel, no blanco de pantalla. */
      "--color-canvas": "oklch(97.5% 0.008 90)",
      "--color-surface": "oklch(99.5% 0.004 90)",
      "--color-surface-sunken": "oklch(96% 0.01 90)",
      "--color-ink": "oklch(22% 0.012 80)",
      "--color-ink-muted": "oklch(48% 0.01 80)",
      "--color-line": "oklch(89% 0.012 85)",
      "--color-line-strong": "oklch(80% 0.016 85)",

      /* Sin redondeo: documento, no aplicación. */
      "--radius-xs": "0",
      "--radius-sm": "0.0625rem",
      "--radius-md": "0.125rem",
      "--radius-lg": "0.125rem",

      "--densidad-fila": "2.75rem",
      "--densidad-texto": "13.5px",
    },
  },
];

export const THEME_STORAGE_KEY = "erp-direccion-visual";

/** Dirección por defecto mientras el cliente no elige. */
export const DEFAULT_THEME_ID = "mostrador";

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
