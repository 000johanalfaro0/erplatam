import type { Metadata } from "next";

import ConfiguracionClient from "./configuracion-client";

export const metadata: Metadata = { title: "Configuración" };

export default function ConfiguracionPage() {
  return <ConfiguracionClient />;
}
