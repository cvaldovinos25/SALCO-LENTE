# Salco Lente

Experiencia web con **realidad aumentada** para ayudar a decidir una compra en Farmacias Salcobrand. La persona apunta la cámara al **código de barras** de un producto (de cualquier categoría) y la app superpone tarjetas flotantes con:

- **Para qué sirve** y cómo se usa (con pasos).
- **Semáforo de ingredientes** según su perfil (embarazo o lactancia, evita fragancias, piel sensible).
- **Precio por unidad** (por ml, g, cápsula, pañal…) y **alternativas** más baratas o parecidas.
- Un **modelo 3D** del producto flotando al centro, que se puede girar con el dedo.

Además: **comparar dos productos** lado a lado, **Mi lista** con un **QR para caja**, y un **cupón por explorar categorías** (mecánica de juego, configurable).

> Es una herramienta **informativa**. No diagnostica ni recomienda medicamentos. Los medicamentos se muestran solo con la información de su ficha.

Sitio (GitHub Pages): `https://cvaldovinos25.github.io/SALCO-LENTE/`

## Estructura

```
SALCO-LENTE/
├── index.html          Interfaz (mobile first), estilos y pantallas
├── js/
│   ├── config.js       Cupón, categorías y textos legales (lo que se edita)
│   ├── app.js          Flujo: escaneo, vista RA, comparar, lista, perfil
│   └── model3d.js      Modelos 3D genéricos (ampolla, tubo, caja, pote, frasco, bomba)
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
| `modelo` | Forma 3D, colores y texto de la etiqueta (ver abajo) |
| `verificado` | Marca interna: pasa a `true` cuando el equipo revisó la ficha |

**Fuentes recomendadas**: el maestro de productos de Salcobrand (EAN, precio, formato), fichas técnicas de los laboratorios y, para medicamentos, el folleto aprobado. Los textos de salud y de ingredientes deben ser **revisados por un químico farmacéutico**.

**Catálogo en vivo**: en `js/config.js`, `CATALOGO_URL` puede apuntar a un servicio de Salcobrand que devuelva este mismo JSON (debe permitir CORS desde el dominio del sitio). Si falla, se usa `data/productos.json`. No existe una API pública documentada de Salcobrand que yo conozca: hay que pedirla a TI o a e-commerce.

## Modelos 3D

Se generan por código con three.js según `modelo.tipo`: `ampolla`, `frasco`, `pote`, `tubo`, `caja`, `bomba`, con `color`, `acento` y las `lineas` de texto de la etiqueta. Son **representaciones estilizadas**, no copias exactas del envase. Para parecerse más a cada envase se pueden ajustar colores y textos, o agregar una forma nueva en `js/model3d.js`.

## Qué es "realidad aumentada" acá (y qué no)

La cámara se ve de fondo y las tarjetas y el modelo 3D flotan encima, con un leve efecto de paralaje con el movimiento del celular. **No hay seguimiento (tracking) del envase físico**: las tarjetas no se pegan al producto si lo mueves. Es una RA ligera, robusta y que funciona en cualquier celular desde un QR, sin instalar nada.

## Lectura de códigos de barras

Usa el lector nativo del navegador (`BarcodeDetector`, en Chrome Android) y, si no existe (por ejemplo Safari en iPhone), la librería ZXing incluida. Si no se logra leer, la persona puede **escribir el código** o **buscar por nombre**. Probado con un código EAN-13 simulado en navegador de escritorio; falta probar en celulares reales con envases reales (brillos, curvatura y poca luz afectan la lectura).

## Privacidad

- Las imágenes de la cámara **no se guardan ni se envían**: se procesan en el celular.
- El perfil, la lista y las categorías exploradas se guardan solo en el celular (almacenamiento local del navegador).
- No hay analítica ni cookies. Las librerías se sirven desde el mismo sitio.

## Aspectos legales y de salud (revisar antes del lanzamiento)

- Medicamentos: solo información de ficha, sin recomendar ni comparar eficacia. Revisión del área técnica (químico farmacéutico) y legal.
- Semáforo y avisos de embarazo, alergias, etc.: son orientativos y dependen de la calidad de los datos cargados.
- Cupón: las bases y el texto de `config.js` son de ejemplo.

## Pendientes y límites

- Cargar el catálogo real y validar los textos.
- Probar en celulares reales (iPhone y Android) y en la góndola con su luz.
- Opcional: stock por local (requiere acceso al inventario), fotos reales de productos, QR por pasillo/categoría, medición de uso.
- La mecánica del "cupón" no se valida en caja: es un código de ejemplo.

## Créditos

[three.js](https://threejs.org) (MIT), [ZXing](https://github.com/zxing-js/library) (Apache 2.0), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT). Ver licencias en `lib/`.
