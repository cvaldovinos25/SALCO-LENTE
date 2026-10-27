# Salco Lente

Experiencia web con **realidad aumentada** para ayudar a decidir una compra en Farmacias Salcobrand. La persona apunta la cámara al **código de barras** de un producto (de cualquier categoría) y la app superpone tarjetas flotantes con:

- **Para qué sirve** y cómo se usa (con pasos).
- **Semáforo de ingredientes** (fragancia, alcohol, embarazo o lactancia, piel sensible), según la ficha del producto.
- **Precio por unidad** (por ml, g, cápsula, pañal…) y **alternativas** más baratas o parecidas.
- Las tarjetas **siguen al producto** y se mantienen ancladas a él mientras se mueve el celular o el envase.

Además: **comparar dos productos** lado a lado, un **historial** de lo escaneado (se puede reabrir cada producto y agregarlo a la lista), **Mi lista** con un **QR para caja**, y un **recordatorio de usar tu código Mi Salcobrand** en caja.

> Es una herramienta **informativa**. No diagnostica ni recomienda medicamentos. Los medicamentos se muestran solo con la información de su ficha.

Sitio (GitHub Pages): `https://cvaldovinos25.github.io/SALCO-LENTE/`

## Estructura

```
SALCO-LENTE/
├── index.html          Interfaz (mobile first), estilos y pantallas
├── js/
│   ├── config.js       Recordatorio Mi Salcobrand, categorías y textos legales (lo que se edita)
│   ├── app.js          Flujo: escaneo, vista RA, comparar, lista, historial
│   ├── model3d.js      Modelo 3D del producto a partir de su foto (vista sin cámara)
│   └── ar.js           Lectura del código y seguimiento visual (anclaje al producto)
├── data/productos.json Catálogo (¡DE EJEMPLO, hay que reemplazarlo!)
├── lib/                three.js (3D), ZXing (lector de códigos), qrcode-generator, licencias
├── img/sb-logo.png     Logo de Farmacias Salcobrand
├── qr/                 QR de acceso listo para imprimir
├── demo-codigos.html   Códigos de barras de prueba (solo para probar)
└── .nojekyll
```

No hay servidor ni base de datos. Todo corre en el celular.

## Cómo publicarlo (GitHub Pages)

1. Crea un repositorio llamado `SALCO-LENTE` y sube **todo el contenido de esta carpeta** (con `index.html` en la raíz).
2. *Settings > Pages > Deploy from a branch > main / root*.
3. En 1 o 2 minutos queda en `https://cvaldovinos25.github.io/SALCO-LENTE/`. Imprime el QR de `qr/qr-salco-lente.png`. Si usas otro nombre de repositorio hay que regenerar el QR.
4. La cámara requiere **HTTPS** (GitHub Pages ya lo incluye). En Instagram u otras apps con navegador integrado puede no funcionar: abre el enlace en Safari o Chrome.

Para probar sin productos reales: abre `demo-codigos.html` en una pantalla y apunta la cámara a un código.

## Lo más importante: cargar el catálogo real

`data/productos.json` trae **14 productos de ejemplo** (con EAN ficticios válidos y precios ilustrativos; los textos de SKIN1004, Cluny y NIVEA son referenciales). **Hay que reemplazarlo por el catálogo real de Salcobrand.** Cada producto tiene:

| Campo | Qué es |
|---|---|
| `id`, `ean` | Identificador interno y código de barras (EAN-13, EAN-8 o UPC) |
| `categoria` | `skincare`, `bebe`, `vitaminas`, `salud`, `higiene` (se pueden agregar en `config.js`) |
| `marca`, `nombre`, `formato` | Textos que ve la persona |
| `cantidad` | `{ "valor": 55, "unidad": "ml" }` para calcular el **precio por unidad** |
| `precio` | Precio en CLP |
| `foco`, `resumen`, `cuando`, `pasos` | Para qué sirve, cuándo se usa y pasos de uso |
| `ingredientes` | Ingredientes clave (lista corta) |
| `flags` | `fragancia` (true/false/null), `alcohol`, `embarazo` (`ok`/`consultar`/`evitar`), `sensible` (`ok`/`revisar`), `alergenos` |
| `advertencias` | Avisos que aparecen en la hoja de detalle |
| `alternativas` | `id` de productos parecidos (se muestra su precio por unidad) |
| `imagen` | Ruta o URL de la foto del producto (ej. `img/productos/centella.jpg`). Si falta o no carga, se muestra el ícono de la categoría. `tools/descargar-imagenes.py` las descarga desde un CSV `id,url_imagen` |
| `verificado` | Marca interna: pasa a `true` cuando el equipo revisó la ficha |

**Fuentes recomendadas**: el maestro de productos de Salcobrand (EAN, precio, formato), fichas técnicas de los laboratorios y, para medicamentos, el folleto aprobado. Los textos de salud y de ingredientes deben ser **revisados por un químico farmacéutico**.

**Catálogo en vivo**: en `js/config.js`, `CATALOGO_URL` puede apuntar a un servicio de Salcobrand que devuelva este mismo JSON (debe permitir CORS desde el dominio del sitio). Si falla, se usa `data/productos.json`. No existe una API pública documentada de Salcobrand que yo conozca: hay que pedirla a TI o a e-commerce.

## Modelo 3D (vista sin cámara)

Al abrir un producto desde la búsqueda, el historial o la lista, se muestra un **modelo 3D que se gira con el dedo** (gira solo mientras no se toca). Está **basado en la foto del producto** (`imagen` en el catálogo): se separa el producto del fondo, con su silueta se arma el sólido (frasco, tubo, ampolla o caja) y la foto se proyecta en el frente; la parte de atrás lleva el color medio del envase. `modelo.tipo` (`ampolla`, `frasco`, `bomba`, `pote`, `tubo`, `caja`) indica si es redondo, plano (`tubo`) o rectangular (`caja`).

**Condiciones**: el navegador solo puede leer los píxeles de la foto si está en el mismo sitio o si su servidor permite CORS. Con las fotos enlazadas directo desde `static.salcobrand.cl` puede no funcionar: en ese caso se muestra un modelo genérico con la etiqueta. Lo más seguro es **descargar las fotos al repo** con `tools/descargar-imagenes.py` (quedan en `img/productos/`). Funciona mejor con fotos de fondo liso (blanco). Es una aproximación: no reproduce detalles que no se ven en una sola foto (la parte de atrás, el relieve).

## Cómo se ancla la información al producto (`js/ar.js`)

1. Se lee el código de barras (cada ~140 ms) y se obtiene su posición en la imagen.
2. Esa zona (el código y el envase que lo rodea, en proporción al tamaño del código) se guarda como plantilla y se sigue cuadro a cuadro por comparación de imagen (template matching sobre una versión reducida y suavizada), probando también pequeños cambios de tamaño: así la información sigue al producto aunque lo acerques o lo alejes, y se puede leer sin tener el código pegado a la cámara. La lectura usa la cámara en alta resolución (hasta 1920 px) y alterna cuadro completo y recorte central para detectar códigos más pequeños.
3. Las tarjetas se ubican alrededor de esa posición, con una línea guía y un marco sobre el producto. Cada vez que el código se lee de nuevo, la posición se corrige para evitar deriva.
4. Si se pierde el seguimiento (movimiento muy brusco, tapar el envase o sacarlo de cuadro), las tarjetas se atenúan y aparece "Apunta de nuevo al código para reubicar la información".

**Límites honestos**: es seguimiento **2D en la imagen**, no hay pose 3D real ni WebXR, así que no hay perspectiva ni oclusión: las tarjetas siguen al producto cuando se mueve o el celular se desplaza, pero no "se pegan" en una cara del envase al girarlo. En pruebas con video simulado el error medio fue ~14 px (sobre 1280 px) con seguimiento continuo. **Falta probar en celulares reales** con envases reales (brillos, curvatura, poca luz).

## Qué es "realidad aumentada" acá

La cámara se ve de fondo y la información se mantiene en el espacio sobre el producto, sin instalar nada: funciona desde un QR en el navegador. Si el navegador no permite la cámara, hay una vista sin RA con la misma información.

## Tipografía

Los títulos usan **Avenir Bold** (`Avenir Next`/`Avenir` si el dispositivo la tiene, como iPhone y Mac). Avenir es una fuente con licencia y no se puede incluir en el sitio: en Android y Windows se usa Nunito Bold (Google Fonts) como reemplazo. Para usar Avenir en todos los dispositivos hay que comprar la licencia web y cargarla con `@font-face` en `index.html`.

## Lectura de códigos de barras

Usa el lector nativo del navegador (`BarcodeDetector`, en Chrome Android) y, si no existe (por ejemplo Safari en iPhone), la librería ZXing incluida. Si no se logra leer, la persona puede **escribir el código** o **buscar por nombre**. Probado con un código EAN-13 simulado en navegador de escritorio; falta probar en celulares reales con envases reales (brillos, curvatura y poca luz afectan la lectura).

## Privacidad

- Las imágenes de la cámara **no se guardan ni se envían**: se procesan en el celular.
- El historial y la lista se guardan solo en el celular (almacenamiento local del navegador).
- No hay analítica ni cookies. Las librerías se sirven desde el mismo sitio.

## Aspectos legales y de salud (revisar antes del lanzamiento)

- Medicamentos: solo información de ficha, sin recomendar ni comparar eficacia. Revisión del área técnica (químico farmacéutico) y legal.
- Semáforo y avisos de embarazo, alergias, etc.: son orientativos y dependen de la calidad de los datos cargados.

## Pendientes y límites

- Cargar el catálogo real y validar los textos.
- Probar en celulares reales (iPhone y Android) y en la góndola con su luz.
- Opcional: stock por local (requiere acceso al inventario), fotos reales de productos, QR por pasillo/categoría, medición de uso.

## Créditos

[three.js](https://threejs.org) (MIT), [ZXing](https://github.com/zxing-js/library) (Apache 2.0), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT). Ver licencias en `lib/`.
