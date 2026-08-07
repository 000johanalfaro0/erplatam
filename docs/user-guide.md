# Guía de uso

Para quien va a usar el sistema en el mostrador. Sin tecnicismos.

## Entrar

Con el correo y la contraseña que te dieron. Si te equivocas cinco veces
seguidas, la cuenta se bloquea un minuto — es a propósito, para que nadie pueda
adivinar tu contraseña probando. Espera y vuelve a intentarlo.

La sesión dura **12 horas**. Da para una jornada completa sin volver a entrar.

## El recorrido guiado

Arriba a la derecha hay un botón con un birrete 🎓. Son siete pasos y no llega a
dos minutos. Puedes salir con **Escape** y retomarlo cuando quieras.

---

## Vender

**Ventas → Nueva venta**, o el botón azul del panel.

1. **Escanea el código de barras** o escribe el nombre del producto.
2. Se agrega al ticket. Escanear tres veces el mismo refresco pone "3", no tres
   renglones.
3. Ajusta cantidades con los botones **−** y **+**, o escribiendo el número.
4. Elige el cliente si te pide factura. Si no, déjalo en "Público en general".
5. **Cobrar** (o pulsa **F2**).
6. Elige cómo te paga. Si es efectivo, escribe con cuánto paga y el sistema
   calcula el cambio. Hay botones rápidos de $100, $200 y $500.
7. **Confirmar cobro.**

El sistema descuenta el inventario solo. No tienes que ajustar nada.

### El precio se puede cambiar

Si le haces un precio especial a un cliente, edita el precio en el renglón. Queda
registrado quién lo hizo y cuándo.

### Si dice que no hay existencia

Significa que el sistema cree que ya no queda. Puede ser que otra caja acabe de
vender las últimas piezas, o que el inventario esté mal. Ve a **Inventario** y
haz un ajuste por conteo.

---

## Inventario

**Inventario** muestra todo tu catálogo con lo que queda de cada cosa.

Las filas **en amarillo** son productos por debajo de su punto de reorden — hay
que pedirlos. El botón **Solo stock bajo** te deja solo esos: es tu lista de
compras del día.

### Dar de alta un producto

**Nuevo producto**. Lo mínimo es nombre, SKU y precio.

Mientras escribes precio y costo, el sistema te muestra **cuánto ganas por
unidad**. Si vendes por debajo del costo te avisa en rojo antes de guardar.

**Avisar bajo** es cuántas piezas deben quedar para que te avise. Si vendes 5
diarios y el proveedor tarda 3 días, pon 15.

### Mover existencia

Menú **⋯** de la fila → **Mover existencia**. Tres opciones:

| Opción | Cuándo |
|---|---|
| **Entrada** | Llega mercancía sin compra registrada: devolución de cliente, traspaso |
| **Salida** | Se pierde: merma, caducidad, rotura, consumo interno |
| **Ajuste por conteo** | Contaste el anaquel y no coincide con el sistema |

En el ajuste escribes **cuántas hay realmente**, no la diferencia. El sistema
calcula la resta y te la muestra antes de confirmar.

**El motivo es obligatorio** en los tres casos. Es lo que te permitirá saber
dentro de dos meses por qué faltaban diez piezas.

---

## Compras

Registra lo que le compras a tus proveedores. Suma al inventario **y actualiza
cuánto te cuesta cada producto** — por eso la ganancia que ves es la de hoy y
no la de hace seis meses.

Los costos de proveedor normalmente van **sin IVA**; hay una casilla para
indicarlo.

---

## Gastos

Todo lo que sale que no es mercancía: renta, luz, sueldos, mantenimiento.

La **fecha del gasto** se puede poner hacia atrás. Si pagas la luz el martes y
lo capturas el viernes, pon el martes: así los reportes del mes salen bien.

Sin registrar gastos, el sistema te mostrará ingresos y creerás que son
ganancia.

---

## Reportes

| Reporte | Responde |
|---|---|
| **Resumen** | ¿Gané dinero este mes? |
| **Ventas por periodo** | ¿Cómo va comparado con antes? |
| **Productos vendidos** | ¿Qué me deja más ganancia? |
| **Gastos** | ¿En qué se me va el dinero? |
| **Inventario** | ¿Cuánto tengo parado en el almacén? |

Todos se descargan a Excel con el botón de exportar.

> **Ojo:** el reporte de productos está ordenado por **ganancia**, no por
> unidades vendidas. Un producto puede venderse muchísimo y no dejarte nada.

---

## Cancelar una venta

**Ventas** → abre la venta → **Cancelar**. Hay que escribir el motivo.

La venta **no se borra**: queda marcada como cancelada, con tu nombre y el
motivo. La mercancía vuelve al inventario.

No todos pueden cancelar. Es deliberado: es la operación con la que se roba en
un mostrador.

---

## Dejar comentarios sobre el sistema

Esto es lo más importante de la demo.

Abajo hay un botón **Modo feedback**. Al activarlo:

- **Clic derecho** sobre cualquier cosa que quieras comentar. El sistema
  reconoce solo qué es.
- **Dibujar zona** y arrastra un rectángulo donde quieras algo que no existe.
  Por ejemplo: un botón para imprimir el ticket.

Escribe qué quieres, qué tan urgente es, y guarda. Se adjunta una captura de tu
pantalla automáticamente.

**No hace falta que sepas explicarlo en términos técnicos.** Dilo como lo dirías
en voz alta: *"cuando cobro, la clienta casi siempre pide el ticket impreso"*.

Eso llega al equipo con la pantalla exacta que estabas viendo.

---

## Preguntas frecuentes

**¿Puedo usarlo en dos computadoras a la vez?**
Sí. Si dos cajas intentan vender la última pieza al mismo tiempo, una la vende y
a la otra le avisa que ya no hay. El inventario nunca queda mal.

**¿Qué pasa si se va la luz a mitad de una venta?**
La venta no se registra. No queda a medias: o se guarda completa o no se guarda.

**¿Puedo borrar un producto que ya vendí?**
Sí, deja de aparecer en el catálogo. Pero las ventas viejas lo siguen mostrando
correctamente — el histórico no se altera.

**¿Quién puede ver qué?**
- **Cajero:** vende y consulta. No cancela ni ajusta inventario ni ve reportes.
- **Encargado:** todo lo de operación, incluidos reportes y cancelaciones.
- **Administrador:** todo, más usuarios y configuración.

**Se me olvidó la contraseña.**
Pídele al administrador que te la restablezca.

**¿Se puede saber quién hizo qué?**
Sí. **Auditoría** registra cada operación importante con quién, cuándo y desde
dónde. No se puede borrar.
