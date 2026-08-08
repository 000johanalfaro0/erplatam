import ExcelJS from "exceljs";

/**
 * EXPORTACIÓN A EXCEL
 * ===========================================================================
 * Antes había un botón que decía "Exportar a Excel" y descargaba un CSV. Se
 * abre en Excel, sí, pero llega sin formato: las cantidades como texto, las
 * fechas al revés según la configuración regional del equipo, y los acentos
 * rotos si alguien lo abre con doble clic. El cliente pidió Excel "con
 * diseño"; esto es un `.xlsx` de verdad.
 *
 * QUÉ APORTA FRENTE AL CSV, en orden de lo que más se nota:
 *
 *   1. LOS NÚMEROS SON NÚMEROS. El importe lleva formato de moneda de Excel,
 *      no un texto con símbolo. Se puede sumar, ordenar y filtrar. Un CSV con
 *      "$1,234.50" es una cadena, y la primera vez que alguien intenta hacer
 *      un SUMA() se lleva un cero.
 *   2. LAS FECHAS SON FECHAS. Un CSV con "07/08/2026" lo interpreta cada
 *      Excel según su idioma; en uno en inglés eso es 8 de julio.
 *   3. Encabezado congelado, autofiltro y anchos calculados. Con doscientas
 *      filas, la diferencia entre útil e inservible.
 *   4. Una fila de totales donde tiene sentido, con fórmula real de Excel:
 *      si el usuario borra filas, el total se recalcula solo.
 *
 * DECISIÓN DE ESTILO: sobrio a propósito. Encabezado en gris oscuro con
 * texto blanco, líneas finas, cero colores decorativos. Esto acaba impreso o
 * pegado en un correo al contador, y un degradado de colores ahí no ayuda a
 * nadie.
 */

export type TipoColumna = "texto" | "dinero" | "cantidad" | "fecha" | "porcentaje" | "entero";

export interface ColumnaExcel<T> {
  titulo: string;
  /** Valor crudo. Los importes en pesos —NO en centavos—, las fechas como Date. */
  valor: (fila: T) => string | number | Date | null;
  tipo?: TipoColumna;
  /** Ancho en caracteres. Si se omite se calcula del contenido. */
  ancho?: number;
  /** Suma la columna en la fila de totales. */
  totaliza?: boolean;
}

/** Formatos de número, en la convención de Excel. */
const FORMATOS: Record<TipoColumna, string | undefined> = {
  texto: undefined,
  dinero: '"$"#,##0.00',
  cantidad: "#,##0.###",
  entero: "#,##0",
  porcentaje: "0.00%",
  fecha: "dd/mm/yyyy hh:mm",
};

const GRIS_OSCURO = "FF2B2F36";
const GRIS_LINEA = "FFD8DCE2";
const GRIS_SUAVE = "FFF3F5F7";

export interface OpcionesHoja<T> {
  /** Nombre de la pestaña. */
  hoja: string;
  /** Título grande de la primera fila. */
  titulo: string;
  /** Línea de contexto: negocio, periodo, filtros aplicados. */
  subtitulo?: string;
  columnas: ColumnaExcel<T>[];
  filas: readonly T[];
}

export async function construirExcel<T>(
  opciones: OpcionesHoja<T>,
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Demo";
  libro.created = new Date();

  // Nombre de pestaña: Excel prohíbe : \ / ? * [ ] y más de 31 caracteres.
  const hoja = libro.addWorksheet(
    opciones.hoja.replace(/[:\\/?*[\]]/g, "").slice(0, 31),
  );

  const numColumnas = opciones.columnas.length;

  // --- Título y subtítulo ---------------------------------------------------
  hoja.mergeCells(1, 1, 1, numColumnas);
  const celdaTitulo = hoja.getCell(1, 1);
  celdaTitulo.value = opciones.titulo;
  celdaTitulo.font = { size: 14, bold: true, color: { argb: GRIS_OSCURO } };
  hoja.getRow(1).height = 22;

  if (opciones.subtitulo) {
    hoja.mergeCells(2, 1, 2, numColumnas);
    const celdaSub = hoja.getCell(2, 1);
    celdaSub.value = opciones.subtitulo;
    celdaSub.font = { size: 10, color: { argb: "FF6B7280" } };
  }

  const filaEncabezado = opciones.subtitulo ? 4 : 3;

  // --- Encabezado -----------------------------------------------------------
  const encabezado = hoja.getRow(filaEncabezado);
  opciones.columnas.forEach((columna, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = columna.titulo;
    celda.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GRIS_OSCURO },
    };
    celda.alignment = {
      vertical: "middle",
      horizontal: columna.tipo && columna.tipo !== "texto" ? "right" : "left",
    };
  });
  encabezado.height = 20;

  // --- Datos ----------------------------------------------------------------
  opciones.filas.forEach((fila, indice) => {
    const numeroFila = filaEncabezado + 1 + indice;
    const filaExcel = hoja.getRow(numeroFila);

    opciones.columnas.forEach((columna, i) => {
      const celda = filaExcel.getCell(i + 1);
      celda.value = columna.valor(fila);

      const formato = FORMATOS[columna.tipo ?? "texto"];
      if (formato) celda.numFmt = formato;

      celda.font = { size: 10 };
      celda.border = { bottom: { style: "hair", color: { argb: GRIS_LINEA } } };
    });

    // Filas alternas: sobre doscientas líneas, seguir una con el dedo en la
    // pantalla es exactamente para lo que sirve.
    if (indice % 2 === 1) {
      filaExcel.eachCell({ includeEmpty: true }, (celda) => {
        celda.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GRIS_SUAVE },
        };
      });
    }
  });

  // --- Totales --------------------------------------------------------------
  const columnasTotal = opciones.columnas
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.totaliza);

  if (columnasTotal.length > 0 && opciones.filas.length > 0) {
    const numeroFila = filaEncabezado + 1 + opciones.filas.length;
    const filaTotales = hoja.getRow(numeroFila);

    filaTotales.getCell(1).value = "Total";
    filaTotales.getCell(1).font = { bold: true, size: 10 };

    for (const { c, i } of columnasTotal) {
      const letra = hoja.getColumn(i + 1).letter;
      const celda = filaTotales.getCell(i + 1);
      // Fórmula y no un número calculado aquí: si el usuario filtra o borra
      // filas, el total se recalcula solo. Un total precocinado se queda
      // mintiendo en cuanto alguien toca la hoja.
      celda.value = {
        formula: `SUM(${letra}${filaEncabezado + 1}:${letra}${numeroFila - 1})`,
      };
      const formato = FORMATOS[c.tipo ?? "texto"];
      if (formato) celda.numFmt = formato;
      celda.font = { bold: true, size: 10 };
    }

    filaTotales.eachCell({ includeEmpty: true }, (celda) => {
      celda.border = { top: { style: "thin", color: { argb: GRIS_OSCURO } } };
    });
  }

  // --- Anchos, congelado y filtro -------------------------------------------
  opciones.columnas.forEach((columna, i) => {
    if (columna.ancho) {
      hoja.getColumn(i + 1).width = columna.ancho;
      return;
    }

    // Se mide el contenido real, con tope: una columna de notas larguísimas
    // no debe empujar el resto fuera de la pantalla.
    const largos = opciones.filas.map((fila) => {
      const v = columna.valor(fila);
      if (v === null || v === undefined) return 0;
      if (v instanceof Date) return 16;
      return String(v).length;
    });

    hoja.getColumn(i + 1).width = Math.min(
      46,
      Math.max(columna.titulo.length + 3, ...largos, 9) + 2,
    );
  });

  hoja.views = [{ state: "frozen", ySplit: filaEncabezado }];
  hoja.autoFilter = {
    from: { row: filaEncabezado, column: 1 },
    to: { row: filaEncabezado, column: numColumnas },
  };

  const datos = await libro.xlsx.writeBuffer();
  return Buffer.from(datos);
}

/** Respuesta de descarga con el tipo MIME correcto. */
export function respuestaExcel(datos: Buffer, nombreArchivo: string): Response {
  const nombre = nombreArchivo.endsWith(".xlsx")
    ? nombreArchivo
    : `${nombreArchivo}.xlsx`;

  return new Response(new Uint8Array(datos), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // El nombre va en `filename*` con codificación UTF-8 para que los
      // acentos del nombre del negocio no lleguen rotos al escritorio.
      "Content-Disposition": `attachment; filename="${nombre.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** Centavos a pesos, para que Excel reciba un número y no un texto. */
export function aPesos(centavos: number): number {
  return centavos / 100;
}

/** Mili-unidades a unidades. */
export function aUnidades(mili: number): number {
  return mili / 1000;
}
