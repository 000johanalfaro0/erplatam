/**
 * Guion del tutorial guiado (requisito 20).
 *
 * ORDEN DELIBERADO: lo PRIMERO que se enseña no es cómo vender, es cómo
 * ANOTAR sobre la pantalla.
 *
 * Durante una demo, lo más valioso que puede hacer el cliente no es aprender
 * el sistema: es decirnos qué le falta. Si termina el recorrido sabiendo
 * vender pero sin saber que puede pegar una nota sobre cualquier cosa que no
 * le cuadre, hemos perdido el motivo de la demo.
 *
 * Por eso los tres primeros pasos son la capa de anotaciones, y solo después
 * viene el paseo por los módulos.
 *
 * El guion vive separado del componente que lo pinta: cambiar un texto no
 * debe obligar a tocar lógica de interfaz, y así se puede leer de corrido
 * para comprobar que cuenta una historia coherente.
 */

export interface TourStep {
  /**
   * Selector del elemento a iluminar. Se usa `data-tour` en lugar de clases o
   * jerarquía DOM: rediseñar una pantalla no debe romper el tutorial.
   * Si es `null`, el paso se muestra centrado sin resaltar nada.
   */
  target: string | null;
  title: string;
  body: string;
  /** Ruta a la que navegar antes de mostrar el paso. */
  route?: string;
  /** Indicación de qué hacer. Se muestra destacada. */
  action?: string;
}

export const TOUR_STEPS: TourStep[] = [
  // ---------------------------------------------------------------------
  // PARTE 1 — Cómo darnos feedback. Lo más importante de esta demo.
  // ---------------------------------------------------------------------
  {
    target: null,
    route: "/",
    title: "Bienvenido. Empecemos por lo más importante",
    body: "Vas a usar este sistema con datos reales unos días. Lo que más nos sirve no es que lo uses bien: es que nos digas qué le falta, qué te estorba y qué harías distinto. Te enseño cómo en treinta segundos.",
  },
  {
    target: "[data-tour=feedback-boton]",
    route: "/",
    title: "Este botón es tu voz",
    body: "Actívalo cuando algo no te cuadre. La pantalla se marca en ámbar para que sepas que estás anotando y no operando: mientras esté activo, los clics no ejecutan nada.",
    action: "Pulsa “Modo feedback” para activarlo",
  },
  {
    target: null,
    route: "/",
    title: "Haz clic en lo que quieras comentar",
    body: "Con el modo activo, haz clic sobre cualquier cosa —un botón, una columna, un precio— y escribe qué cambiarías. La nota se queda pegada ahí, como un pósit, y la vemos exactamente donde tú la dejaste.",
    action: "Dilo como lo dirías en voz alta. No hace falta ser técnico",
  },
  {
    target: null,
    route: "/",
    title: "Y si falta algo que no existe, también",
    body: "¿Quieres un botón que no está? ¿Una columna que no ves? Haz clic cerca y descríbelo. No hace falta que sepas si es posible: para eso estamos nosotros.",
  },

  // ---------------------------------------------------------------------
  // PARTE 2 — Paseo por el sistema.
  // ---------------------------------------------------------------------
  {
    target: "[data-tour=nav-dashboard]",
    route: "/",
    title: "Ahora sí, el sistema",
    body: "El panel responde cómo va el día: ventas de hoy, del mes, gastos y ganancia estimada. Abajo, lo que hay que resurtir y quién hizo qué. Nada está aquí por adorno.",
  },
  {
    target: "[data-tour=nav-sales]",
    route: "/",
    title: "Ventas es donde cobras",
    body: "Escaneas o buscas el producto, se arma el ticket y cobras. El sistema calcula el IVA y el cambio. Si tienes lector de código de barras, funciona sin tocar el ratón.",
  },
  {
    target: "[data-tour=nav-inventory]",
    route: "/inventario",
    title: "El inventario se mueve solo",
    body: "Cada venta descuenta, cada compra suma. No ajustas nada a mano. Lo que sí queda registrado es todo movimiento, con su motivo y quién lo hizo, para que puedas saber por qué falta algo.",
  },
  {
    target: "[data-tour=nav-purchases]",
    route: "/inventario",
    title: "Las compras actualizan tu costo",
    body: "Al registrar lo que le compras al proveedor, además de sumar existencia se actualiza cuánto te cuesta cada producto. Por eso el margen que ves es el de hoy y no el de hace seis meses.",
  },
  {
    target: "[data-tour=nav-reports]",
    route: "/inventario",
    title: "Reportes para decidir",
    body: "Cuánto vendiste, qué productos te dejan más ganancia (no los que más se venden: los que más dejan), en qué se te va el dinero y cuánto tienes parado en el almacén. Todo se exporta a Excel.",
  },
  {
    target: "[data-tour=feedback-boton]",
    route: "/inventario",
    title: "Recuerda: cualquier cosa, anótala",
    body: "No te guardes nada. Si algo te parece raro, lento, feo o incompleto, pégale una nota. Eso es exactamente lo que hace útil esta demo.",
    action: "Puedes volver a ver este recorrido cuando quieras, con el botón 🎓",
  },
];

/**
 * Clave en localStorage, a la que se añade el id del usuario.
 *
 * Se guarda por usuario y no de forma global para que, si dos personas usan
 * el mismo equipo, la segunda también vea el recorrido.
 *
 * LIMITACIÓN CONOCIDA: al ser localStorage, es por navegador. Un usuario que
 * entre desde otro equipo volverá a ver el tutorial. Para la demo es
 * aceptable y evita una migración; la solución de producción es un campo
 * `onboardedAt` en la tabla de usuarios.
 */
export const TOUR_STORAGE_KEY = "erp-tour-completado";

export function tourStorageKey(userId: string): string {
  return `${TOUR_STORAGE_KEY}:${userId}`;
}
