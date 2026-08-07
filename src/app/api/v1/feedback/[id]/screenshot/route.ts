import { requireContext } from "@/server/http/context";
import { route } from "@/server/http/response";
import { getFeedbackScreenshot } from "@/server/modules/feedback";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/feedback/:id/screenshot
 *
 * Sirve la captura como imagen binaria, no como JSON en base64. Así el
 * navegador puede mostrarla con un `<img src>` normal, cachearla y
 * decodificarla de forma nativa.
 *
 * Sigue estando protegida: pasa por `requireContext`, así que una captura de
 * la pantalla de un negocio no es accesible sin sesión válida de ese negocio.
 */
export const GET = route(async (_request: Request, { params }: Params) => {
  const ctx = await requireContext();
  const { id } = await params;

  const shot = await getFeedbackScreenshot(ctx, id);

  return new Response(new Uint8Array(shot.data), {
    status: 200,
    headers: {
      "Content-Type": shot.mimeType,
      // Una captura nunca cambia: se puede cachear agresivamente. `private`
      // impide que un proxy compartido la guarde para otros usuarios.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
