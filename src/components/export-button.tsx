"use client";

import { FileSpreadsheet } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "./ui/button";

/**
 * Botón de exportación a Excel.
 *
 * POR QUÉ SE DESCARGA CON `fetch` Y NO CON UN `<a href>`: si el servidor
 * responde un error —sesión caducada, sin permiso—, el navegador enseñaría
 * el JSON del error en una pestaña en blanco, o descargaría un archivo
 * llamado "gastos.xlsx" con un mensaje de error dentro. Trayéndolo aquí se
 * puede comprobar que la respuesta es correcta ANTES de guardar nada, y si
 * falla se dice con un aviso normal.
 *
 * Los filtros de la pantalla se pasan tal cual: el archivo tiene que
 * parecerse a lo que el usuario tiene delante. Exportar "todo" cuando está
 * mirando marzo filtrado por categoría es regalarle trabajo.
 */
export function ExportButton({
  endpoint,
  filtros,
  etiqueta = "Excel",
  variant = "secondary",
}: {
  /** Ruta de la API, sin prefijo. Por ejemplo "/expenses/export". */
  endpoint: string;
  /** Filtros actuales de la pantalla. Los vacíos se descartan. */
  filtros?: Record<string, string | number | boolean | undefined | null>;
  etiqueta?: string;
  variant?: "secondary" | "ghost";
}) {
  const [descargando, setDescargando] = React.useState(false);

  async function descargar() {
    setDescargando(true);

    try {
      const params = new URLSearchParams();
      for (const [clave, valor] of Object.entries(filtros ?? {})) {
        if (valor === undefined || valor === null || valor === "") continue;
        params.set(clave, String(valor));
      }

      const respuesta = await fetch(
        `/api/v1${endpoint}${params.size ? `?${params}` : ""}`,
        { credentials: "same-origin" },
      );

      if (!respuesta.ok) {
        // El error viene en JSON con el formato de siempre de la API.
        const detalle = await respuesta
          .json()
          .then((j) => j?.error?.message)
          .catch(() => null);
        throw new Error(detalle ?? "No pudimos generar el archivo.");
      }

      const blob = await respuesta.blob();

      // El nombre lo decide el servidor; aquí solo se lee de la cabecera.
      const cabecera = respuesta.headers.get("content-disposition") ?? "";
      const codificado = /filename\*=UTF-8''([^;]+)/i.exec(cabecera)?.[1];
      const simple = /filename="([^"]+)"/i.exec(cabecera)?.[1];
      const nombre = codificado
        ? decodeURIComponent(codificado)
        : (simple ?? "export.xlsx");

      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      // Sin esto el blob se queda en memoria hasta recargar la página.
      URL.revokeObjectURL(url);

      toast.success(`${nombre} descargado`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos generar el archivo.",
      );
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={descargar}
      loading={descargando}
      title="Descarga lo que estás viendo, con los filtros aplicados"
    >
      <FileSpreadsheet />
      {etiqueta}
    </Button>
  );
}
