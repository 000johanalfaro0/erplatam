import { type NextRequest, NextResponse } from "next/server";

/**
 * Proxy: cabeceras de seguridad y primera barrera de rutas.
 *
 * (En Next.js 16 este archivo sustituye al antiguo `middleware.ts`; el
 * comportamiento es el mismo, cambia el nombre de la convención.)
 *
 * IMPORTANTE — qué hace y qué NO hace este archivo.
 *
 * Corre en el runtime Edge, donde no hay acceso a la base de datos. Por tanto
 * SOLO puede comprobar si existe una cookie de sesión, no si esa sesión es
 * válida, si fue revocada o si el usuario sigue activo.
 *
 * Eso lo convierte en una optimización, no en el control de acceso: evita
 * cargar la aplicación entera para acabar redirigiendo. La autorización real
 * ocurre dos capas más adentro:
 *
 *   1. El layout protegido resuelve la sesión contra la base de datos.
 *   2. Cada servicio de dominio verifica permisos con `requirePermission`.
 *
 * Confiar solo en esta capa sería un fallo de seguridad clásico: bastaría
 * fabricar una cookie con cualquier valor para pasar el filtro.
 */

const SESSION_COOKIE = "erp_session";

/** Rutas accesibles sin sesión. */
const PUBLIC_PATHS = [
  "/login",
  "/registro",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Política de seguridad de contenido.
 *
 * Cada directiva y su motivo:
 *
 *   default-src 'self'      Solo se carga lo que sirve esta misma aplicación.
 *   script-src              'unsafe-inline' es necesario para el script que
 *                           aplica el tema antes del primer pintado y para el
 *                           arranque de Next.js. Se acota con 'strict-dynamic'
 *                           en producción para que solo los scripts ya
 *                           confiables puedan cargar otros.
 *   style-src 'unsafe-inline'  Requerido: Next inyecta estilos en línea y
 *                           Radix calcula posiciones con estilos dinámicos.
 *   img-src data: blob:     Las capturas del modo feedback se generan en el
 *                           navegador como blobs.
 *   connect-src 'self'      La aplicación no habla con ningún tercero. Si algo
 *                           intentara exfiltrar datos, el navegador lo
 *                           bloquearía.
 *   frame-ancestors 'none'  Impide que la aplicación se embeba en un iframe
 *                           ajeno: es la defensa contra clickjacking.
 *   form-action 'self'      Un formulario inyectado no puede enviar datos
 *                           fuera del dominio.
 *   object-src 'none'       No hay plugins que explotar.
 */
function contentSecurityPolicy(isDev: boolean): string {
  return [
    "default-src 'self'",
    isDev
      ? // En desarrollo, Turbopack necesita eval para la recarga en caliente.
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isDev = process.env.NODE_ENV !== "production";

  const hasSessionCookie = Boolean(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  /*
   * Puerta abierta para enseñar la demo. Con `DEMO_ACCESO_LIBRE` puesta, este
   * filtro deja pasar sin cookie; quien decide de verdad quién es el visitante
   * sigue siendo `getOptionalContext`, que consulta la base de datos. Si la
   * variable apunta a un correo que no existe o está desactivado, allí se
   * resuelve a "sin sesión" y la petición acaba en el login igualmente.
   *
   * Aquí solo se abre el paso; no se concede identidad. Esa distinción es la
   * misma de siempre en este archivo: el filtro es defensa en profundidad, no
   * la autorización.
   */
  const accesoLibre = Boolean(process.env.DEMO_ACCESO_LIBRE?.trim());

  let response: NextResponse;

  if (!hasSessionCookie && !accesoLibre && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      // Las llamadas de API reciben un 401 con el mismo formato de error que
      // el resto de la API, no una redirección HTML que el cliente no sabría
      // interpretar.
      response = NextResponse.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Tu sesión expiró. Inicia sesión nuevamente.",
          },
        },
        { status: 401 },
      );
    } else {
      const loginUrl = new URL("/login", request.url);
      // Se conserva el destino para volver ahí tras autenticarse.
      if (pathname !== "/") {
        loginUrl.searchParams.set("destino", `${pathname}${search}`);
      }
      response = NextResponse.redirect(loginUrl);
    }
  } else {
    response = NextResponse.next();
  }

  const headers = response.headers;

  headers.set("Content-Security-Policy", contentSecurityPolicy(isDev));

  // Impide que el navegador adivine el tipo de contenido. Sin esto, un archivo
  // subido podría interpretarse como script.
  headers.set("X-Content-Type-Options", "nosniff");

  // Redundante con frame-ancestors, pero cubre navegadores antiguos.
  headers.set("X-Frame-Options", "DENY");

  // No filtrar rutas internas al navegar a sitios externos.
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // La aplicación no necesita cámara, micrófono ni ubicación.
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );

  if (!isDev) {
    // Fuerza HTTPS durante dos años, incluidos subdominios.
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Se excluyen los recursos estáticos: aplicarles el middleware solo añade
     * latencia y coste sin aportar seguridad.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
