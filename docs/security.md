# Seguridad por capas

Este documento explica qué protege el sistema, **cómo**, **por qué** y —lo más
importante— **qué no protege**. Está escrito para que se entienda sin ser
especialista.

Un principio recorre todo lo demás: **cada medida tiene que responder a una
amenaza concreta**. Nada está aquí porque "se ve profesional". Donde una
protección tiene límites reales, se dicen.

---

## Capa 1 — Frontend (el navegador)

### Amenaza: robo de sesión mediante scripts inyectados (XSS)

Si alguien logra ejecutar JavaScript en la página, lo primero que intenta es
leer la sesión y suplantar al usuario.

**Protección**
- La cookie de sesión es `httpOnly`: **JavaScript no puede leerla**, ni
  siquiera el propio. Aunque un atacante ejecute código, no se lleva la sesión.
- React escapa por defecto todo lo que se interpola. No se usa
  `dangerouslySetInnerHTML` salvo en un único punto: el script de dos líneas
  que aplica el tema antes del primer pintado, cuyo contenido es constante y
  no depende de datos.
- Política de Seguridad de Contenido (CSP) que restringe de dónde puede cargar
  código el navegador.

**Limitación honesta:** la CSP incluye `'unsafe-inline'` para scripts, porque
Next.js lo requiere para arrancar. Eso debilita la CSP como defensa contra XSS.
La defensa real aquí es el escapado de React y la cookie `httpOnly`. Un CSP con
nonces sería más estricto y está anotado como mejora.

### Amenaza: falsificación de peticiones desde otro sitio (CSRF)

Una web maliciosa que visite el usuario podría lanzar peticiones a nuestro
sistema aprovechando su sesión abierta.

**Protección:** la cookie usa `SameSite=Lax`. El navegador no la envía en
peticiones de escritura originadas en otro sitio. Como toda operación que
modifica datos usa POST/PATCH/DELETE, el vector queda cerrado.

Se eligió `Lax` y no `Strict` porque `Strict` rompe llegar a la aplicación
desde un enlace externo ya autenticado, sin ganancia real en este caso.

### Amenaza: la aplicación embebida en un sitio ajeno (clickjacking)

**Protección:** `frame-ancestors 'none'` y `X-Frame-Options: DENY`.

---

## Capa 2 — API (la puerta de entrada)

### Amenaza: datos malformados que provocan estados imposibles

**Protección:** toda entrada pasa por un esquema Zod **antes** de llegar a la
lógica de negocio. No es validación cosmética: los tipos que usa el dominio
salen de esos esquemas, así que es imposible que llegue algo sin validar.

Un cuerpo JSON malformado devuelve 422 con los errores por campo, no un 500.

### Amenaza: fuga de información técnica en los errores

Un mensaje como `PrismaClientKnownRequestError: Unique constraint failed on
Product_businessId_sku_key` le dice a un atacante el motor de base de datos, los
nombres de tabla y los índices.

**Protección:** todo error lleva **dos** mensajes. `userMessage` va al
navegador; el detalle técnico solo al log del servidor. Cualquier excepción no
prevista se convierte en un 500 genérico.

### Amenaza: abuso por volumen de peticiones

**Protección:** limitación por ventana deslizante, con cupos distintos según el
tipo de endpoint.

**Limitación honesta y deliberada:** el contador vive en la memoria del
proceso. En Vercel, cada función serverless tiene su propia memoria, así que
con N instancias el límite efectivo es N × límite. **No es una defensa sólida.**

Se incluye igualmente porque frena el caso real y frecuente —un bucle en el
cliente, alguien recargando compulsivamente— y cuesta cero. La defensa REAL
contra fuerza bruta de credenciales no está aquí, sino en la capa 3.

---

## Capa 3 — Autenticación y autorización

### Amenaza: adivinar contraseñas por fuerza bruta

**Protección:** bloqueo temporal **por cuenta**, persistido en base de datos.
Tras 5 intentos fallidos la cuenta se bloquea 1 minuto; el siguiente fallo, 5
minutos; después, 15.

Se eligió bloqueo por cuenta y no por IP porque en un negocio todas las cajas
comparten la misma IP pública: limitar por IP castigaría a los empleados
legítimos mientras un atacante rota direcciones. Y **el estado vive en
Postgres**, así que sí es consistente entre instancias serverless.

El bloqueo es temporal y no permanente a propósito: uno permanente convierte un
ataque en una denegación de servicio contra el negocio.

### Amenaza: enumerar qué cuentas existen

Si "usuario inexistente" y "contraseña incorrecta" respondieran distinto —o
tardaran distinto— se podría averiguar qué correos son válidos.

**Protección:** ambos casos devuelven **el mismo mensaje y el mismo código**.
Y cuando el correo no existe se ejecuta igualmente una comparación de
contraseña de descarte, para consumir el mismo tiempo.

Verificado:
```
contraseña incorrecta → 401 INVALID_CREDENTIALS "Correo o contraseña incorrectos."
usuario inexistente   → 401 INVALID_CREDENTIALS "Correo o contraseña incorrectos."
```

### Amenaza: robo de la base de datos y uso de las contraseñas

**Protección:** bcrypt con coste 10. Nunca se guarda la contraseña.

**Por qué bcrypt y no argon2**, que es la recomendación actual: `bcryptjs` es
JavaScript puro, sin binarios nativos, así que funciona idéntico en Windows y
en las funciones serverless de Vercel. Para un MVP esa previsibilidad vale más
que el margen extra. Coste 10 y no 12 porque al ser JS puro es ~4× más lento;
12 añadiría casi un segundo a cada acceso. Migrar a `@node-rs/argon2` está
anotado como mejora, y se puede hacer rehasheando en el siguiente acceso de
cada usuario.

### Amenaza: una sesión robada sigue viva

**Protección:** las sesiones son **opacas y viven en base de datos**, no JWT
autocontenido. Eso permite revocarlas al instante — echar a alguien del sistema
ahora mismo, o cerrar todas las sesiones al cambiar la contraseña.

En la base solo se guarda el SHA-256 del token. Si alguien obtiene una copia de
la tabla, no obtiene sesiones utilizables. SHA-256 basta aquí, a diferencia de
las contraseñas, porque el token tiene 256 bits aleatorios: no hay diccionario
que atacar.

Un usuario desactivado pierde el acceso de inmediato, sin esperar a que caduque
su sesión.

### Amenaza: un empleado hace más de lo que debe

**Protección:** RBAC con permisos `recurso:acción`. La comprobación vive en el
**servicio de dominio**, no en la ruta HTTP: así la operación sigue protegida
aunque mañana se invoque desde un script o una cola.

Separaciones deliberadas:
- El cajero **puede vender pero no cancelar ventas**. Cancelar es la operación
  con la que se roba en un mostrador.
- El cajero **no puede ajustar inventario**. Es como se tapa un faltante.
- El encargado opera todo pero **no toca usuarios ni configuración fiscal**.

Ocultar botones en la interfaz es cortesía visual, no seguridad. La
autorización real siempre ocurre en el servidor.

### El middleware NO es control de acceso

`src/proxy.ts` corre en el runtime Edge, sin acceso a base de datos. Solo puede
comprobar si **existe** una cookie, no si es válida. Es una optimización para
no cargar la aplicación entera y acabar redirigiendo.

Confiar en él sería un fallo clásico: bastaría fabricar una cookie con
cualquier valor. La comprobación que manda es la del layout protegido, que sí
consulta la base de datos.

---

## Capa 4 — Lógica de negocio

### Amenaza: estados imposibles por operaciones a medias

"La venta se creó pero el inventario no se actualizó" es corrupción silenciosa:
nadie se entera hasta que el inventario no cuadra semanas después.

**Protección:** las operaciones críticas son **transaccionales**. Verificado con
un test que provoca un fallo a mitad de una venta y comprueba que no queda
rastro parcial.

### Amenaza: dos cajas venden la misma última unidad

**Protección:** bloqueo pesimista `SELECT ... FOR UPDATE` sobre las filas de
producto, **en orden ascendente de id** para minimizar abrazos mortales, con
reintento automático si Postgres detecta uno.

Verificado contra PostgreSQL real: con 1 unidad y 2 cajas simultáneas, una
vende y la otra recibe error de existencia. Nunca queda en negativo.

### Amenaza: cobrar dos veces por un fallo de red

Si la red cae después de que el servidor confirmó la venta, el cajero reintenta
y el cliente paga dos veces.

**Protección:** clave de idempotencia por intento de cobro. Reenviarla devuelve
la venta existente en lugar de crear otra. Verificado con test.

### Amenaza: manipular el histórico

**Protección:**
- Las ventas **no se editan ni se borran**: se cancelan, con motivo y
  responsable, y el importe original se conserva.
- El inventario es un **libro append-only**. Cancelar una venta no borra el
  movimiento original: añade uno de compensación.
- Los catálogos usan **borrado lógico**: un producto eliminado sigue existiendo
  para que los tickets históricos lo referencien.
- Nombre, SKU, precio, costo y tasa se **copian** en cada línea de venta. Si el
  producto se renombra o cambia de precio mañana, el ticket de hoy sigue siendo
  fiel.
- Un movimiento de inventario manual **exige motivo**. Sin él es un agujero
  contable.

### Amenaza: descuadres por redondeo

**Protección:** todo el sistema opera con **enteros**. Dinero en centavos,
cantidades en mili-unidades, tasas en puntos básicos. Cero coma flotante.

El impuesto de un precio que ya lo incluye se calcula **por resta**, no por dos
redondeos, para que base + impuesto sea exactamente el total. Verificado
exhaustivamente para todos los importes de 1 a 2000 centavos.

---

## Capa 5 — Base de datos

| Amenaza | Protección |
|---|---|
| Inyección SQL | Prisma parametriza siempre. El SQL crudo usa parámetros; el único valor interpolado es la granularidad de reportes, restringida por Zod a tres literales |
| Fuga entre negocios | Toda consulta filtra por `businessId`. Los servicios verifican además que las referencias (categoría, proveedor) sean del mismo negocio, porque la clave foránea no lo impide |
| Datos huérfanos | Integridad referencial. `Payment` **no** cascadea desde `PaymentMethod` a propósito: impide borrar un método de pago con cobros asociados |
| Credenciales en el código | Solo en variables de entorno. `.env` está en `.gitignore` |
| Escucha del tráfico | `sslmode=verify-full`: cifra **y** verifica el certificado contra la CA. `require` solo cifra sin comprobar quién está al otro lado |
| Ordenar por columnas internas | Los campos de ordenación pasan por lista blanca. Sin ella, ordenar por `passwordHash` permitiría deducir su contenido |

---

## Capa 6 — Infraestructura

| Cabecera | Qué evita |
|---|---|
| `Strict-Transport-Security` | Que el navegador acepte HTTP. Dos años, subdominios incluidos |
| `X-Content-Type-Options: nosniff` | Que un archivo subido se interprete como script |
| `X-Frame-Options: DENY` | Clickjacking |
| `Referrer-Policy` | Que se filtren rutas internas al navegar fuera |
| `Permissions-Policy` | Acceso a cámara, micrófono y ubicación |

Los secretos viven en las variables de entorno de Vercel, nunca en el
repositorio. El build **no requiere secretos**: se verificó compilando sin
ninguna variable definida.

---

## Capa 7 — Auditoría y observabilidad

### Amenaza: no poder saber qué pasó

**Protección:** bitácora `AuditLog` con quién, qué, cuándo, desde qué IP, y el
estado antes y después.

Decisión clave: **se escribe dentro de la misma transacción** que la operación.
Si la operación revierte, su registro también — no quedan rastros de ventas que
nunca existieron. Y si la auditoría falla, la operación revierte: una operación
crítica sin rastro es peor que una que no ocurrió.

Los inicios de sesión usan `auditDetached`, que no tumba la operación si falla:
un error al auditar un acceso no debe impedir que el cajero entre a cobrar.

**Nunca se registran** contraseñas, hashes ni tokens: hay una lista de campos
prohibidos que se poda antes de escribir.

### Verificación de integridad

`verifyIntegrity()` recalcula la existencia sumando **todos** los movimientos y
la compara con la caché `Product.stock`. Si divergen, alguien escribió `stock`
sin pasar por el libro mayor. Se comprueba al final de cada suite de
integración.

---

## Lo que NO está cubierto

Se dice explícitamente porque una lista de seguridad sin límites es propaganda.

| No cubierto | Por qué / Cuándo haría falta |
|---|---|
| **Segundo factor (2FA)** | No implementado. Recomendable si el sistema maneja varias sucursales o datos fiscales reales |
| **Cifrado a nivel de campo** | Los datos están cifrados en tránsito y en reposo por el proveedor, pero no a nivel de columna. Haría falta si se almacenaran datos bancarios |
| **Limitación distribuida** | La actual es por proceso. Sustituir por Upstash Redis si hay abuso real |
| **CSP con nonces** | La actual usa `'unsafe-inline'` por requisito de Next.js |
| **Rotación automática de secretos** | Manual. `SESSION_SECRET` se rota regenerándolo; invalida todas las sesiones |
| **Auditoría inmutable** | La bitácora es append-only por convención, no por permisos de base de datos. Un administrador con acceso directo podría alterarla. Se resolvería con un usuario de base de datos sin `DELETE` sobre `AuditLog` |
| **Retención y borrado de datos** | Sin política automática. El cuestionario de descubrimiento pregunta cuánto hay que conservar |
| **Pruebas de penetración** | No se han hecho |
| **Facturación CFDI** | No implementada. Los campos fiscales existen; falta integrar un PAC |

## Si algo va mal

1. **Revocar sesiones** de un usuario: desactivarlo (`status: INACTIVE`) corta
   su acceso al instante.
2. **Rotar `SESSION_SECRET`** en Vercel: invalida todas las sesiones activas.
3. **Rotar credenciales de base de datos** desde el panel del proveedor.
4. **Revisar la bitácora**: `/auditoria` filtra por usuario, acción y fecha.
   Cancelaciones de venta y ajustes de inventario están marcados como
   sensibles.
