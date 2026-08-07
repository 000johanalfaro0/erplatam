/**
 * CUESTIONARIO DE DESCUBRIMIENTO (requisito 19)
 * ===========================================================================
 * "Configuración y análisis del negocio".
 *
 * Cada pregunta existe para tomar UNA decisión técnica concreta. El campo
 * `decision` documenta cuál — y no es adorno: si una pregunta no puede
 * justificar qué decisión cambia, sobra. Un cuestionario largo que nadie
 * responde vale menos que uno corto que sí.
 *
 * El formulario está VERSIONADO. Las respuestas se guardan como JSON junto al
 * número de versión, así que añadir o quitar preguntas mañana no invalida ni
 * requiere migrar lo ya respondido.
 */

export const DISCOVERY_FORM_VERSION = 1;

export type QuestionType = "text" | "number" | "select" | "multiselect" | "boolean";

export interface DiscoveryQuestion {
  id: string;
  label: string;
  /** Ayuda en lenguaje del dueño del negocio, no de ingeniería. */
  hint?: string;
  type: QuestionType;
  options?: { value: string; label: string }[];
  required?: boolean;
  /** Unidad que se muestra junto al campo numérico. */
  unit?: string;
  /**
   * Qué decisión técnica depende de esta respuesta. Se muestra al equipo en
   * el resumen, no al cliente.
   */
  decision: string;
}

export interface DiscoverySection {
  id: string;
  title: string;
  description: string;
  questions: DiscoveryQuestion[];
}

export const DISCOVERY_SECTIONS: DiscoverySection[] = [
  {
    id: "negocio",
    title: "Tu negocio",
    description: "Para entender a qué se dedica y de qué tamaño es.",
    questions: [
      {
        id: "businessType",
        label: "¿Qué tipo de negocio es?",
        hint: "Abarrotes, ferretería, farmacia, restaurante…",
        type: "text",
        required: true,
        decision:
          "Determina el catálogo inicial, si hace falta venta por peso y qué reportes priorizar.",
      },
      {
        id: "branches",
        label: "¿Cuántas sucursales tienes?",
        type: "number",
        unit: "sucursales",
        required: true,
        decision:
          "Más de una obliga a activar el modelo multi-sucursal: inventario por ubicación y traspasos. El esquema ya lo permite vía businessId.",
      },
      {
        id: "employees",
        label: "¿Cuántas personas usarán el sistema?",
        type: "number",
        unit: "personas",
        required: true,
        decision:
          "Define cuántos roles distintos hacen falta y si conviene separar permisos más allá de admin/encargado/cajero.",
      },
      {
        id: "devices",
        label: "¿Desde cuántas computadoras o tabletas?",
        type: "number",
        unit: "equipos",
        required: true,
        decision:
          "Dimensiona el pool de conexiones y determina si el bloqueo pesimista actual aguanta o hace falta otra estrategia.",
      },
    ],
  },
  {
    id: "operacion",
    title: "Tu día a día",
    description: "Para dimensionar el sistema al volumen real.",
    questions: [
      {
        id: "salesPerDay",
        label: "¿Cuántas ventas haces al día, más o menos?",
        hint: "Un número aproximado basta.",
        type: "number",
        unit: "ventas/día",
        required: true,
        decision:
          "Estima el crecimiento de la base de datos y si el plan gratuito de 100.000 operaciones al mes es suficiente.",
      },
      {
        id: "peakHours",
        label: "¿A qué horas se te junta más gente?",
        hint: "Por ejemplo: de 2 a 4 de la tarde, y sábados por la mañana.",
        type: "text",
        decision:
          "Identifica cuándo esperar concurrencia real y cuándo NO hacer mantenimiento ni desplegar.",
      },
      {
        id: "concurrentUsers",
        label: "En hora pico, ¿cuántas cajas cobran a la vez?",
        type: "number",
        unit: "cajas simultáneas",
        required: true,
        decision:
          "Es el número que valida la estrategia de concurrencia. Los tests actuales cubren hasta 10 cajas sobre el mismo producto.",
      },
      {
        id: "productCount",
        label: "¿Cuántos productos distintos manejas?",
        type: "number",
        unit: "productos",
        required: true,
        decision:
          "Por encima de unos miles hay que revisar los índices de búsqueda y considerar búsqueda de texto completo.",
      },
    ],
  },
  {
    id: "cobro",
    title: "Cómo cobras",
    description: "Para adaptar el punto de venta a tu forma de trabajar.",
    questions: [
      {
        id: "paymentMethods",
        label: "¿Cómo te pagan tus clientes?",
        type: "multiselect",
        options: [
          { value: "CASH", label: "Efectivo" },
          { value: "CARD", label: "Tarjeta" },
          { value: "TRANSFER", label: "Transferencia" },
          { value: "MERCADO_PAGO", label: "Mercado Pago / terminal digital" },
          { value: "VALES", label: "Vales de despensa" },
          { value: "CREDITO", label: "Fiado / a crédito" },
        ],
        required: true,
        decision:
          "Los métodos ya son configurables. 'Fiado' es el que más cambia el sistema: exigiría cuentas por cobrar, que hoy no existen.",
      },
      {
        id: "needsPrinting",
        label: "¿Necesitas imprimir tickets?",
        type: "boolean",
        decision:
          "Determina si hay que integrar impresión térmica (ESC/POS) y con qué modelo de impresora.",
      },
      {
        id: "usesBarcode",
        label: "¿Usas lector de código de barras?",
        type: "boolean",
        decision:
          "El punto de venta ya está preparado. Confirma si hay que capturar códigos masivamente al cargar el catálogo.",
      },
      {
        id: "needsInvoicing",
        label: "¿Tus clientes te piden factura?",
        hint: "Factura electrónica del SAT (CFDI).",
        type: "select",
        options: [
          { value: "NUNCA", label: "Casi nunca" },
          { value: "A_VECES", label: "De vez en cuando" },
          { value: "SIEMPRE", label: "Muy seguido" },
        ],
        required: true,
        decision:
          "Decide si el CFDI 4.0 es prioridad. Los campos fiscales ya existen en el esquema; falta integrar un PAC.",
      },
    ],
  },
  {
    id: "infraestructura",
    title: "Tu conexión y tus datos",
    description: "Para saber qué necesita aguantar el sistema.",
    questions: [
      {
        id: "needsOffline",
        label: "¿Se te cae el internet con frecuencia?",
        hint: "Si se cae, ¿necesitas poder seguir vendiendo?",
        type: "select",
        options: [
          { value: "NO", label: "No, la conexión es estable" },
          { value: "A_VECES", label: "A veces, pero puedo esperar" },
          { value: "CRITICO", label: "Sí, y no puedo dejar de vender" },
        ],
        required: true,
        decision:
          "LA PREGUNTA MÁS CARA DEL CUESTIONARIO. 'Crítico' obliga a modo offline con sincronización y resolución de conflictos: cambia la arquitectura entera, no es un añadido.",
      },
      {
        id: "dataRetention",
        label: "¿Cuánto tiempo necesitas conservar la información?",
        type: "select",
        options: [
          { value: "1_ANO", label: "Un año" },
          { value: "5_ANOS", label: "Cinco años (lo que pide el SAT)" },
          { value: "SIEMPRE", label: "Para siempre" },
        ],
        required: true,
        decision:
          "Define la política de archivado y el tamaño de almacenamiento a contratar.",
      },
      {
        id: "reportsNeeded",
        label: "¿Qué necesitas saber de tu negocio?",
        type: "multiselect",
        options: [
          { value: "CORTE_CAJA", label: "Cuánto se vendió hoy (corte de caja)" },
          { value: "MAS_VENDIDOS", label: "Qué se vende más" },
          { value: "MAS_GANANCIA", label: "Qué me deja más ganancia" },
          { value: "POR_EMPLEADO", label: "Cuánto vende cada empleado" },
          { value: "INVENTARIO_VALOR", label: "Cuánto dinero tengo en el almacén" },
          { value: "PROVEEDORES", label: "Cuánto le compro a cada proveedor" },
          { value: "CLIENTES_FRECUENTES", label: "Quiénes son mis mejores clientes" },
        ],
        decision:
          "Los cinco primeros ya existen. 'Por empleado' requiere agrupar por userId; los datos ya se guardan.",
      },
      {
        id: "biggestPain",
        label: "¿Qué es lo que más trabajo te da hoy?",
        hint: "Lo que te gustaría que el sistema te quitara de encima.",
        type: "text",
        decision:
          "Pregunta abierta deliberada: suele revelar el requisito real que ninguna pregunta cerrada capta.",
      },
    ],
  },
];

/** Todas las preguntas en plano, para validar y recorrer. */
export const ALL_QUESTIONS: DiscoveryQuestion[] = DISCOVERY_SECTIONS.flatMap(
  (section) => section.questions,
);
