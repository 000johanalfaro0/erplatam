/**
 * Guion del tutorial guiado (requisito 20).
 *
 * Se declara aquí, separado del componente que lo pinta, por dos motivos:
 * cambiar el texto de un paso no debe obligar a tocar lógica de interfaz, y
 * así el guion se puede leer de corrido para comprobar que cuenta una historia
 * coherente.
 *
 * CRITERIO DE CONTENIDO: cada paso responde "¿por qué me importa esto?", no
 * "¿dónde está el botón?". Un tutorial que solo señala controles enseña a usar
 * una interfaz; uno que explica el porqué enseña a llevar el negocio con ella.
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
  {
    target: null,
    title: "Vamos a dar un recorrido",
    body: "Son siete pasos y no llega a dos minutos. Puedes salir cuando quieras con la tecla Escape, y retomarlo después desde el mismo botón.",
  },
  {
    target: "[data-tour=nav-dashboard]",
    route: "/",
    title: "El panel responde cómo va el día",
    body: "Ventas de hoy, del mes, gastos y ganancia estimada. Abajo, lo que hay que resurtir hoy y quién hizo qué. Nada está aquí por adorno: cada cifra contesta una pregunta que te haces a diario.",
  },
  {
    target: "[data-tour=nav-sales]",
    route: "/",
    title: "Ventas es donde cobras",
    body: "Escaneas o buscas el producto, se arma el ticket y cobras. El sistema calcula el IVA y el cambio. Si tienes lector de código de barras, funciona sin tocar el ratón.",
    action: "Haz clic en Ventas para verlo",
  },
  {
    target: "[data-tour=nav-inventory]",
    route: "/inventario",
    title: "El inventario se mueve solo",
    body: "Cada venta descuenta, cada compra suma. No tienes que ajustar nada a mano. Lo que sí queda registrado es todo movimiento, con su motivo y quién lo hizo, para que puedas saber por qué falta algo.",
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
    body: "Cuánto vendiste, qué productos te dejan más ganancia (no los que más se venden: los que más dejan), en qué se te va el dinero y cuánto tienes parado en el almacén. Todo se puede exportar a Excel.",
  },
  {
    target: "[data-tour=nav-feedback]",
    route: "/inventario",
    title: "Y lo más importante: dinos qué falta",
    body: "Activa el Modo feedback en la barra de abajo y haz clic derecho sobre cualquier cosa que quieras cambiar. Puedes incluso dibujar dónde quieres un botón que no existe. Todo lo que anotes nos llega con la pantalla exacta que estabas viendo.",
    action: "Es la herramienta que hace útil esta demo",
  },
];

/** Clave en localStorage. Recuerda si ya se completó, para no repetirlo. */
export const TOUR_STORAGE_KEY = "erp-tour-completado";
