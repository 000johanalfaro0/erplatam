/**
 * Generación de CSV.
 *
 * POR QUÉ CSV Y NO XLSX O PDF (requisito 11)
 * ---------------------------------------------------------------------------
 * CSV se abre en Excel, en Google Sheets y en el sistema del contador, sin
 * dependencias, sin generar el archivo en memoria y sin una librería de 2 MB
 * en el bundle. Para reportes tabulares —que es lo que son todos los de este
 * sistema— es estrictamente suficiente.
 *
 * XLSX tendría sentido si hicieran falta varias hojas, fórmulas o formato.
 * PDF, si el reporte fuera para imprimir y firmar. Ninguno de los dos aporta
 * nada hoy, así que no se añaden. El punto de cambio está aislado aquí.
 *
 * DOS DETALLES QUE PARECEN MENORES Y NO LO SON:
 *
 * 1. BOM UTF-8. Sin él, Excel en Windows abre el archivo en la codificación
 *    del sistema y "Jabón" aparece como "JabÃ³n". Tres bytes que deciden si
 *    el reporte se ve bien o parece roto.
 *
 * 2. Neutralización de fórmulas. Una celda que empieza por = + - o @ la
 *    interpreta Excel como fórmula. Un producto llamado "=SUMA(A1:A9)" —o
 *    peor, algo malicioso— se ejecutaría al abrir el archivo. Es la
 *    vulnerabilidad de inyección de fórmulas en CSV, y se previene
 *    anteponiendo un apóstrofo.
 */

export type CsvValue = string | number | boolean | Date | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

/** Caracteres que Excel interpreta como inicio de fórmula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  let text: string;

  if (value instanceof Date) {
    // ISO recortado a minutos: legible y ordenable alfabéticamente.
    text = value.toISOString().slice(0, 16).replace("T", " ");
  } else if (typeof value === "boolean") {
    text = value ? "Sí" : "No";
  } else {
    text = String(value);
  }

  // Neutralización de fórmulas.
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    text = `'${text}`;
  }

  // Comillas, comas y saltos de línea obligan a entrecomillar la celda.
  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function toCsv<T>(rows: readonly T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = [
    columns.map((column) => escapeCell(column.header)).join(","),
  ];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(","));
  }

  // CRLF: es lo que espera Excel en Windows.
  return lines.join("\r\n");
}

/**
 * Respuesta HTTP de descarga.
 *
 * El nombre del archivo incluye la fecha para que quien descargue varios
 * reportes no acabe con "reporte(3).csv" sin saber cuál es cuál.
 */
export function csvResponse(csv: string, filename: string): Response {
  // BOM UTF-8. Ver explicación arriba: sin esto Excel destroza los acentos.
  //
  // Se construye con `fromCharCode` y NO como carácter literal en el código:
  // el BOM es invisible en el editor, y cualquier herramienta que toque el
  // archivo —un formateador, un copiar y pegar, una edición con la
  // codificación equivocada— puede borrarlo sin que nadie lo note. De hecho
  // eso ya pasó una vez en este archivo. Así es imposible perderlo en
  // silencio, y el test lo verifica.
  const BOM = String.fromCharCode(0xfeff);

  return new Response(BOM + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Un reporte descargado no debe quedar cacheado: los datos cambian.
      "Cache-Control": "no-store",
    },
  });
}

/** Centavos a decimal con dos cifras, para la columna de importe. */
export function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Mili-unidades a decimal, para la columna de cantidad. */
export function csvQuantity(milli: number): string {
  return (milli / 1000).toFixed(3).replace(/\.?0+$/, "");
}

/** Basis points a porcentaje. */
export function csvPercent(bps: number | null): string {
  return bps === null ? "" : (bps / 100).toFixed(2);
}
