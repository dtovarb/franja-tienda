# FRANJA: resumen de entrega del prototipo

Tienda streetwear con editor de prendas, hecha desde cero con HTML, CSS, JavaScript vanilla y Fabric.js 5.3.0. Funciona en local con cualquier servidor estático (ver [README](README.md)). No tiene backend. Todo lo que se guarda queda en el navegador y la interfaz lo aclara cada vez que lo menciona.

## 1. Funciones implementadas

### Marca e interfaz
- La marca es **FRANJA, estudio de prendas**. Las cinco franjas de la referencia funcionan como firma de marca: aparecen en el logo, en el subrayado del hero, en el borde del editor, en el footer y en el favicon.
- La paleta se definió como variables CSS en `assets/css/tokens.css`. El blanco se usa de fondo y el magenta oscuro para los CTA y los estados activos. Los naranjas y el rosa quedan como acentos, y el texto va en casi negro. Los colores de la paleta nunca se usan como colores de prenda: el catálogo tiene sus propios colores de indumentaria.
- Tipografías: los titulares usan **Archivo** variable condensada al 72 % en peso 900, y la interfaz usa **Space Grotesk**. Space Mono se reserva para etiquetas editoriales. Para las estampas hay 7 fuentes: Archivo Black, Anton, Bebas Neue, Archivo, Space Grotesk, Space Mono y Permanent Marker.
- Las páginas son Inicio, Catálogo con filtros por tipo, Producto, Editor y Carrito. Hay una banda permanente que avisa que el sitio es un prototipo con datos de demostración. No hay testimonios, ventas ni estadísticas inventadas.
- No había fotos disponibles, así que dibujé **mockups vectoriales originales** de cuatro prendas: remera clásica, remera oversize, buzo canguro y tote bag, cada una con frente y espalda, sombreado y costuras. También hice tres gráficas propias. Todas están marcadas como contenido de demostración.

### Selección de producto
- En la página de producto se elige el color, el talle (con su recargo y su stock de ejemplo, y los talles sin stock aparecen deshabilitados) y la cantidad. El precio se actualiza en vivo y el área de impresión se muestra en centímetros.
- La selección viaja al editor por la URL. Desde la pestaña «Prenda» del editor se puede cambiar sin salir.
- Todos los precios salen de un solo módulo (`pricing.js`), que suma el precio base, el recargo por talle, $4.500 por cada cara estampada extra y la técnica, que ya está preparada aunque hoy no tiene recargo.

### Editor (Fabric.js)
- **Área imprimible proporcional.** Mockup, guías y canvas comparten un espacio lógico de 1000 × 1200 unidades, y el editor solo cambia el zoom. Las guías van en un SVG superpuesto, así que nunca aparecen en lo que se exporta.
- **Frente y espalda** tienen cada una su diseño y su propio historial de deshacer y rehacer. Un punto naranja indica qué cara tiene diseño.
- **Imágenes JPG, PNG y SVG.** Se pueden agregar con el selector o arrastrándolas, y los archivos subidos se ven en miniatura sobre fondo de damero.
  - **Validación:** extensión, tipo MIME, contenido real del archivo (magic bytes), peso máximo de 25 MB, entre 50 y 12.000 px por lado y hasta 80 MP.
  - **SVG:** se rechaza si trae scripts, atributos `on*`, `foreignObject`, entidades o recursos externos.
  - **Transparencia:** se conserva.
- **Textos.** Se pueden agregar todos los que hagan falta. Se edita el contenido, la fuente, el tamaño, el color de tinta (8 colores o uno libre), la negrita y la alineación. La negrita se desactiva en las fuentes que tienen un solo peso. Haciendo doble clic se edita el texto directo en la prenda.
- **Edición.**
  - Se puede seleccionar, mover, escalar y rotar. El escalado mantiene siempre la proporción porque oculté los tiradores laterales.
  - Hay botones para duplicar, eliminar y ordenar capas, y para vaciar la cara, con confirmación y la opción de deshacer.
  - En el panel se ajustan con números la posición, el ancho y el alto **en cm reales**, y la rotación en grados.
  - Botones para centrar y para ajustar al área.
  - Una barra contextual flotante sobre el elemento seleccionado y una lista de capas.
  - Cuando un elemento pasa cerca del centro horizontal, se alinea solo.
- **Fuera del área.** El borde se pone rojo, aparece un aviso con el botón «Ajustar» y no se puede finalizar hasta corregirlo.
- **Resolución.** Para cada imagen se calcula el DPI efectivo según el tamaño al que va a imprimirse. Por debajo de 300 DPI el aviso es aceptable y por debajo de 150 es bajo. Los umbrales se configuran por técnica.
- **Atajos:** Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Ctrl+D, Supr, flechas (con Shift avanza de a 10) y Esc.
- **Autoguardado.** El borrador se guarda en este navegador y se recupera si se recarga la página.
- **Móvil.** La prenda queda centrada. Abajo hay una barra táctil (Subir, Texto, Editar, Capas, Prenda) y los paneles se abren como hoja inferior que se cierra. Los controles táctiles miden al menos 44 px y los tiradores de Fabric se agrandan con el tacto.

### Finalizar diseño
El botón **«Finalizar diseño»** corre 8 pasos y muestra cada uno en pantalla:
1. Valida el producto y las variantes.
2. Revisa que haya contenido y que todo esté dentro del área.
3. Reconstruye el diseño desde el JSON en un canvas aparte y compara la cantidad y el tipo de elementos.
4. Genera la vista previa.
5. Genera la estructura editable.
6. Vuelve a calcular el SHA-256 de cada original para confirmar que está intacto.
7. Revisa la resolución. Si hay imágenes de baja resolución, el cliente tiene que confirmar que lo entiende antes de agregar al carrito.
8. Prepara los datos para el carrito.

Después muestra el resumen de producto, color, talle, cantidad, caras y precio desglosado. Desde ahí se puede volver al editor sin perder nada, o agregar al carrito (o actualizar el artículo, si se entró desde el carrito).

### Archivos y exportación (descargas reales)
| Archivo | Detalle |
|---|---|
| Original | Los mismos bytes que se subieron, guardados en IndexedDB con su SHA-256 |
| Diseño editable | JSON `franja.design/v1`: JSON de Fabric por cara, con el área física y las imágenes como `asset:<sha256>`. No lleva binarios adentro |
| Vista previa | PNG de 1200 × 1440 de la prenda con el diseño |
| Impresión | PNG con fondo transparente, sin prenda, guías ni controles. A 150, 200 o 300 DPI, del área completa o recortado al contenido, con el DPI declarado en el archivo (chunk `pHYs`) |
| Paquete ZIP | Todo lo anterior junto, más un LEEME |

La resolución de exportación no depende de la pantalla, porque se renderiza desde el JSON al tamaño físico. Exportar con más píxeles no mejora una imagen chica, y así lo dice la interfaz.

### Carrito
- Cada artículo tiene su miniatura, su variante, las caras estampadas, el precio desglosado y su propio diseño con sus originales. Se puede cambiar la cantidad, eliminar con confirmación, calcular el subtotal y el total, y volver a editar el diseño.
- Para editar desde el carrito el editor trabaja sobre una copia del diseño. Si no se finaliza, el artículo queda como estaba.
- El precio siempre se recalcula desde el catálogo.
- «Continuar (demo)» termina en una confirmación que dice explícitamente que **no se creó ningún pedido ni se cobró nada**, y muestra el JSON que la tienda real le mandaría a la API.

## 2. Pruebas realizadas y resultados

Corrí `tests/e2e.mjs` con Playwright y Chromium en el contenedor: **37 de 37 pruebas OK**, en dos corridas seguidas y sin errores en la consola. El detalle está en `tests/results.json` y las capturas en `tests/screenshots/`.

**Escritorio (1440×900)**
- Inicio, catálogo y filtros.
- Recargo de talle XXL.
- La selección se mantiene al entrar al editor.
- Rechazo de un `.png` falso, de un SVG con `<script>` y de un `.gif`.
- El PNG subido coincide byte a byte con el original (SHA-256).
- Texto: contenido, fuente, tamaño, color, negrita y alineación.
- Arrastre con el mouse.
- X = 15 cm, ancho = 20 cm y 30°.
- Escalado por esquina con x = y.
- Duplicar y eliminar, con deshacer y rehacer por botón y por atajo.
- Aviso de elemento fuera del área, finalizar bloqueado y corrección con «Ajustar».
- Frente y espalda independientes.
- Advertencia de DPI bajo.
- Alineación de canvas y prenda en 3 tamaños de ventana.
- El borrador se recupera al recargar.
- Finalizar completa los 8 pasos.
- Vista previa de 1200 × 1440.
- Impresión de 3572 × 4762 px = 30,2 × 40,3 cm a 300 DPI, con esquinas transparentes.
- Recorte al contenido a 150 DPI.
- El JSON no lleva binarios.
- El original descargado es idéntico al subido.
- El ZIP pasa la verificación de CRC y de hashes.
- Volver al editor no pierde cambios.
- Carrito: 2 × $23.400 = $46.800, y con 3 unidades $70.200.
- Edición desde el carrito sin duplicar el artículo.
- Confirmación de demo.
- Eliminar un artículo.
- Vaciar una cara y deshacer.

**Móvil táctil (390×844)**
- Inicio, catálogo, producto, editor y carrito sin desborde horizontal.
- El menú se abre.
- Los botones miden 44 px o más.
- Con el panel abierto, la prenda se sigue viendo (236 × 284 px).
- El arrastre táctil mueve el elemento.
- Finalizar y agregar al carrito funciona.

**Tablet (820×1180)**
- Las 5 páginas, sin desborde.

**Lo que falló en el camino y quedó corregido**
- Fabric redondeaba las escalas a 2 decimales y eso alteraba el tamaño impreso. Ahora guarda 6.
- Al editar desde el carrito no se respetaba la cantidad del artículo.
- Había estilos compartidos que faltaban en el editor.
- La barra superior en móvil se partía en tres filas.

**Lo que no probé:** Safari y Firefox reales (solo Chromium), lectores de pantalla y archivos de más de 20 MB.

## 3. Limitaciones conocidas
- **La persistencia es local.** El carrito y los diseños van en localStorage (unos 5 MB) y los originales en IndexedDB. No se sincronizan entre dispositivos y se pierden si se borran los datos del sitio. Los originales que quedan sin usar no se limpian solos.
- **Las medidas físicas son del talle M.** El área de impresión no cambia según el talle: si se escala por talle o se usa un área fija es una decisión del taller.
- **Los mockups son vectoriales y el color es aproximado.** No hay fotos reales ni simulación de textura o pliegues.
- No hay recorte ni máscara de imágenes, ni efectos como contorno, sombra o texto en curva.
- La exportación de impresión es solo PNG. No genera PDF ni separación de colores, y CMYK no se maneja en el navegador.
- Los SVG se rasterizan al exportar a la resolución elegida, así que el vector original no se transforma a otro formato. El original sí se conserva y se puede descargar.
- Con imágenes muy grandes, la exportación a 300 DPI puede tardar unos segundos y consumir memoria en teléfonos de gama baja.
- El precio cobrado y el stock tienen que validarse en el servidor. Hoy son de ejemplo.

## 4. Funciones que necesitan backend
- Cuentas de usuario (registro e inicio de sesión) y carritos persistentes entre dispositivos.
- Catálogo administrable: productos, tipos de prenda, colores, talles, variantes, stock, precios y técnicas.
- Almacenamiento seguro de archivos en un bucket privado con URLs firmadas que vencen, y validación de archivos repetida en el servidor.
- Diseños versionados y asociados a cada pedido.
- Pedidos reales con varios artículos personalizados, recálculo de precio y stock, y pagos (Mercado Pago o Stripe) con webhooks.
- Generación de vista previa y archivos de impresión en el servidor, como fuente de verdad para producción.
- Panel de administración: cola de producción, estados (recibido, revisión de archivo, impreso, terminado, enviado) y descarga autorizada de originales y archivos de impresión.
- Envíos, impuestos y facturación.

## 5. Pasos para convertirlo en una tienda real
1. **Definir producción con el taller:** técnicas (DTF, serigrafía, bordado), áreas físicas por talle, DPI mínimos, formatos de entrega y si hace falta PDF o color separado. Después, cargar esos valores en `garment_types`, `print_areas` y `techniques`.
2. **Backend y base de datos:** Node con Fastify o NestJS, o Django, sobre PostgreSQL. El modelo y los endpoints están en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
3. **Almacenamiento de archivos:** S3, R2 o GCS privado, con subida directa por URL firmada, verificación de hash y validación en el servidor. `asset-store.js` se reemplaza por ese cliente sin tocar el editor.
4. **Conectar el frontend a la API:** `catalog.js`, `designs.js` y `cart.js` pasan a usar `fetch`, y la estructura de los datos se mantiene.
5. **Render del lado del servidor** de la vista previa y la impresión a partir del JSON `franja.design/v1` y los originales.
6. **Checkout y pagos** con creación de la orden idempotente y confirmación por webhook.
7. **Panel de administración** de catálogo, pedidos y producción.
8. **Fotografía real** de las prendas y mockups fotográficos para el editor, reemplazando los SVG de demostración.
9. **Calidad:** pruebas en Safari, Firefox y dispositivos reales, auditoría de accesibilidad, monitoreo de errores y analítica.
10. **Legal y operación:** términos, política de privacidad, derechos de autor sobre los diseños subidos, cambios y devoluciones.
