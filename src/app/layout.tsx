import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Caveat,
  Inter,
  Source_Serif_4,
} from "next/font/google";

import { Providers } from "@/components/providers";
import { BRAND } from "@/config/brand";
import { DEFAULT_THEME_ID, THEMES, THEME_STORAGE_KEY } from "@/config/themes";

import "./globals.css";

/**
 * TIPOGRAFÍAS
 *
 * `display: swap` en las tres: el texto se pinta de inmediato con la del
 * sistema y se sustituye al cargar. Evita la pantalla en blanco en conexiones
 * lentas, que en un punto de venta es tiempo de caja perdido.
 *
 * Las tres se auto-alojan (next/font las descarga en el build y las sirve
 * desde nuestro dominio). No hay petición a Google en tiempo de ejecución, lo
 * que además mantiene la CSP cerrada: `font-src 'self' data:`.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Dirección "Mostrador": grotesca con carácter, no la Inter de todos. */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

/** Dirección "Libro": serifa de texto con pesos reales y cifras alineadas. */
const sourceSerif = Source_Serif_4({
  variable: "--font-serif-libro",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Letra manuscrita, solo para las notas adhesivas.
 *
 * Caveat y no una de las fuentes "handwriting" más marcadas: hay que poder
 * leer de un vistazo una frase escrita a las once de la noche por alguien
 * enfadado con una pantalla. Legibilidad primero; el gesto, después.
 */
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Direcciones visuales aplicadas antes del primer pintado.
 *
 * Sin esto, el conmutador aplica los tokens en un efecto de React: la página
 * se pinta primero en la dirección por defecto y salta a la elegida un
 * instante después. En una demo ese parpadeo es justo lo que el cliente
 * recuerda. Además así el login también respeta la dirección, y el login es
 * la primera pantalla que va a ver.
 */
const DIRECCIONES = JSON.stringify(
  Object.fromEntries(
    THEMES.map((t) => [t.id, { v: t.tokens, f: t.fuente }]),
  ),
);

const SCRIPT_DIRECCION = `(function(){try{
var d=${DIRECCIONES},r=document.documentElement;
var id=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||${JSON.stringify(DEFAULT_THEME_ID)};
var t=d[id]||d[${JSON.stringify(DEFAULT_THEME_ID)}];
for(var k in t.v)r.style.setProperty(k,t.v[k]);
r.style.setProperty('--font-sans',t.f);
r.dataset.direccion=id;
}catch(e){}})()`;

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
    <html
      lang="es-MX"
      className={`${inter.variable} ${bricolage.variable} ${sourceSerif.variable} ${caveat.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Claro/oscuro y dirección visual, ambos antes del primer pintado para
          evitar el destello. Son scripts en línea, permitidos por la CSP
          (`script-src 'self' 'unsafe-inline'`); su contenido es constante y
          generado por nosotros, nunca entrada del usuario.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('erp-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DIRECCION }} />
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
