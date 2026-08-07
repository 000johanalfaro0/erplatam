import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/components/providers";
import { BRAND } from "@/config/brand";

import "./globals.css";

/**
 * Inter con `display: swap`: el texto se pinta de inmediato con la tipografía
 * del sistema y se sustituye al cargar la fuente. Evita la pantalla en blanco
 * en conexiones lentas, que en un punto de venta es tiempo de caja perdido.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  // La aplicación no debe aparecer en buscadores.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Se permite el zoom: bloquearlo es una barrera de accesibilidad para quien
  // tiene baja visión, y el ahorro visual no lo justifica.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        {/*
          El tema se aplica antes del primer pintado para evitar el destello
          blanco al cargar en modo oscuro. Es un script mínimo e inline; su
          hash está declarado en la CSP del middleware.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('erp-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full antialiased">
        {/* Salto directo al contenido: primer elemento enfocable de la página. */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-100 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:text-accent-ink"
        >
          Saltar al contenido
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
