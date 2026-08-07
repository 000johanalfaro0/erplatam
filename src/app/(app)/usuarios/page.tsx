import type { Metadata } from "next";

import UsuariosClient from "./usuarios-client";

export const metadata: Metadata = { title: "Usuarios" };

export default function UsuariosPage() {
  return <UsuariosClient />;
}
