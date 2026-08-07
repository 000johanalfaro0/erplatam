import { describe, expect, it } from "vitest";

import { csvMoney, csvQuantity, csvResponse, toCsv } from "@/server/core/csv";

describe("toCsv", () => {
  const columnas = [
    { header: "Producto", value: (r: { name: string }) => r.name },
  ];

  it("genera cabecera y filas separadas por CRLF", () => {
    const csv = toCsv([{ name: "Arroz" }, { name: "Frijol" }], columnas);
    expect(csv).toBe("Producto\r\nArroz\r\nFrijol");
  });

  it("entrecomilla las celdas con comas", () => {
    const csv = toCsv([{ name: "Arroz, 1 kg" }], columnas);
    expect(csv).toContain('"Arroz, 1 kg"');
  });

  it("duplica las comillas internas", () => {
    const csv = toCsv([{ name: 'Jabón "Rosa"' }], columnas);
    expect(csv).toContain('"Jabón ""Rosa"""');
  });

  it("neutraliza fórmulas de Excel", () => {
    // Esta es la vulnerabilidad de inyección de fórmulas en CSV: sin el
    // apóstrofo, Excel ejecutaría el contenido de la celda al abrir el
    // archivo.
    for (const peligroso of ["=SUMA(A1:A9)", "+1+1", "-2+3", "@SUM(A1)"]) {
      const csv = toCsv([{ name: peligroso }], columnas);
      expect(csv.split("\r\n")[1]).toBe(`'${peligroso}`);
    }
  });

  it("no toca los nombres normales", () => {
    const csv = toCsv([{ name: "Refresco cola 600 ml" }], columnas);
    expect(csv.split("\r\n")[1]).toBe("Refresco cola 600 ml");
  });

  it("representa los nulos como celda vacía", () => {
    const csv = toCsv([{ name: null as unknown as string }], columnas);
    expect(csv.split("\r\n")[1]).toBe("");
  });
});

describe("csvResponse", () => {
  it("incluye el BOM UTF-8", async () => {
    // Sin el BOM, Excel en Windows abre el archivo con la codificación del
    // sistema y "Jabón" aparece como "JabÃ³n". Se comprueba en un test porque
    // el BOM es invisible y ya se perdió una vez al editar el archivo.
    //
    // Se leen los BYTES y no `.text()`: la especificación de fetch elimina el
    // BOM al decodificar, así que `.text()` daría un falso negativo y haría
    // creer que falta cuando en realidad sí se está enviando. Es exactamente
    // el error que cometió la primera versión de este test.
    const response = csvResponse("Producto\r\nJabón", "prueba.csv");
    const bytes = new Uint8Array(await response.arrayBuffer());

    // EF BB BF es la representación UTF-8 de U+FEFF.
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    // Y el contenido sigue siendo legible tras el BOM.
    expect(new TextDecoder().decode(bytes)).toContain("Jabón");
  });

  it("declara la descarga con el nombre de archivo", () => {
    const response = csvResponse("a", "inventario-2026-08-07.csv");

    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="inventario-2026-08-07.csv"',
    );
  });

  it("impide que el reporte quede cacheado", () => {
    // Los datos cambian; un reporte servido desde caché engaña.
    const response = csvResponse("a", "x.csv");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("formato de celdas numéricas", () => {
  it("convierte centavos a decimal con dos cifras", () => {
    expect(csvMoney(123456)).toBe("1234.56");
    expect(csvMoney(0)).toBe("0.00");
    expect(csvMoney(5)).toBe("0.05");
  });

  it("convierte mili-unidades sin ceros decorativos", () => {
    expect(csvQuantity(3000)).toBe("3");
    expect(csvQuantity(2500)).toBe("2.5");
    expect(csvQuantity(125)).toBe("0.125");
  });
});
