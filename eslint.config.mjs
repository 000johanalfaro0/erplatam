import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    rules: {
      /**
       * `set-state-in-effect` baja de error a aviso. Deuda consciente.
       *
       * QUÉ ES: regla nueva del compilador de React. Avisa de llamar a
       * `setState` de forma síncrona dentro de un efecto, porque provoca un
       * render en cascada.
       *
       * POR QUÉ NO ESTÁ EN ERROR: las nueve apariciones del proyecto son el
       * mismo patrón, y es el patrón correcto para lo que hacen: leer al
       * montar un valor que SOLO existe en el navegador —`localStorage`, la
       * preferencia de tema del sistema— y volcarlo al estado. No se puede
       * leer durante el render sin romper la hidratación, porque el servidor
       * no tiene ese valor.
       *
       * La forma de satisfacer la regla es `useSyncExternalStore` en los
       * nueve sitios. Es la solución correcta y está pendiente, pero es una
       * reescritura transversal que no se hace en vísperas de una demo.
       *
       * LO QUE NO SE HACE: silenciarla. Sigue apareciendo en cada `npm run
       * lint` como aviso, con su archivo y su línea. Lo que se recupera es
       * que `npm run verify` vuelva a estar en verde, para que un fallo
       * NUEVO se distinga de este ruido conocido. Una barrera que siempre
       * está roja no es una barrera.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
