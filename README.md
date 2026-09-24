# La voz de la Junta

Sistema de captura y visualización de voces para la **Junta de Juntas** del Plan Nacional de Desarrollo 2026–2030 — Cámara de Comercio de Cartagena.

Cada asistente escanea un QR, responde **dos preguntas** (visión y compromiso) con una nota de voz o por escrito, y su respuesta se transcribe automáticamente y se ubica en una de las **nueve palancas** del sistema de inteligencia territorial. El resultado se proyecta en vivo.

## Cómo funciona

```
Celular ──► Apps Script (doPost) ──► Drive (audio + ficha)
                                          │
              cada minuto ──► arma las filas en la hoja "Voces"
                         ──► Gemini clave 1: audio → texto
                         ──► Gemini clave 2: texto → palanca, sector, resumen y palabras
                                          │
                       Apps Script (doGet, con clave) ──► Panel en pantalla
```

Las dos etapas usan **claves de proyectos de Google Cloud distintos**, para que cada una tenga su propio cupo y su propia tarea.

## Qué hay en este repositorio

| Ruta | Qué es |
| --- | --- |
| `index.html` | Página de captura. Es la que se publica en GitHub Pages y la que abre el QR. |
| `apps_script/Codigo.gs` | Backend completo: recepción, guardado en Drive, transcripción y clasificación con Gemini, y entrega de datos al panel. Se pega en un proyecto de Google Apps Script. |
| `panel/voz.js`, `panel/voz.css`, `panel/voz.html` | Vista «La voz de la Junta» del panel. Abre con el mismo héroe del inicio, en la paleta de la Cámara, y sigue con tres indicadores —voces recibidas; organizaciones que hablaron, que al tocarlas despliegan la lista con su logo; y un tercero que sigue al filtro Todo / Visión / Compromiso—, la **Nube de palabras** (crecen según cuántas personas las dijeron; al tocar una aparecen las organizaciones que la dijeron) **Palancas y voces** (las nueve palancas, la matriz palanca × sector y el muro de voces) y **Árbol de logos** (las organizaciones que hablaron, la Cámara arriba y las demás por número de voces, en pirámide, ramificado o burbujas, con botón para proyectarlo en una ventana aparte). Incluye el modo proyección. |
| `panel/logos.js` | Catálogo de logos oficiales de las organizaciones invitadas, embebidos como imágenes. La clave de cada entrada es el nombre oficial tal como aparece en `ORGS`, dentro de `voz.js`. Quien no tenga logo sale con un escudo de iniciales. |
| `panel/build.py` | Inserta esas piezas dentro del prototipo del sistema de inteligencia territorial y genera el HTML final del panel. |
| `carteles_qr.html` | Generador del cartel A4 con el QR. Se abre en el navegador, se pega la dirección pública y se imprime. |
| `LEEME_montaje.md` | Pasos de montaje de principio a fin. |
| `PLAN.md` | Estado del proyecto, decisiones y pendientes. |

## Los logos de las organizaciones

`panel/logos.js` trae el logo oficial de 52 de las 60 organizaciones invitadas. Cada uno se bajó del sitio web de la propia entidad y se revisó a ojo antes de entrar; ninguno viene de un banco de imágenes ni de una búsqueda genérica. Las que no tienen logo —porque no tienen sitio propio, porque el sitio no lo publica como archivo suelto o porque no respondió— salen con un escudo de iniciales, que no estorba.

Cada entrada tiene esta forma:

```js
"Nombre oficial exacto":{"d":"data:image/png;base64,....","o":0}
```

`o:1` marca los logos claros, que necesitan fondo oscuro para verse. La clave debe ser idéntica al nombre oficial de `ORGS`, en `voz.js`; si no coincide, la organización sale con escudo.

## Lo que NO está aquí, a propósito

- **Ninguna clave.** Ni las de Gemini ni la del panel. Las de Gemini van en *Configuración del proyecto → Propiedades del script* (`GEMINI_API_KEY` y `GEMINI_API_KEY_2`). La del panel la genera el propio script (`PANEL_TOKEN`) y se pasa al proyectar: `...panel.html?clave=LA_CLAVE`.
- **El ID de la hoja.** `SHEET_ID` viene como marcador de posición. El panel se abre pasándole la fuente y la clave: `panel.html?fuente=<dirección que termina en /exec>&clave=<clave del panel>`.
- **El panel ya compilado.** Se genera con `panel/build.py`, porque lleva dentro el prototipo del sistema de inteligencia territorial, que no es parte de este repositorio. Para armarlo: poner el prototipo como `original.html` dentro de `panel/` y ejecutar `python3 build.py`.
- **Las respuestas de las personas.** No están aquí ni lo estarán.

Quien clone este repositorio obtiene **el sistema completo, no los datos**. Las respuestas viven en la hoja y en la carpeta de Drive de la entidad, y solo las ve quien tenga permiso sobre ellas.

## Montaje rápido

1. Crear una hoja de cálculo en Google Sheets y copiar su ID.
2. Crear un proyecto en [script.google.com](https://script.google.com), pegar `apps_script/Codigo.gs` y poner ese ID en `SHEET_ID`.
3. En *Propiedades del script*, agregar `GEMINI_API_KEY` (transcripción) y `GEMINI_API_KEY_2` (clasificación). Deben ser de **dos proyectos de Google Cloud distintos**: los límites de Gemini se aplican por proyecto, no por clave, así que dos claves del mismo proyecto comparten cupo y no sirven de nada.
4. Ejecutar `configurar()` una vez. Crea la hoja `Voces`, la carpeta de audios y la bandeja en Drive, el disparador de cada minuto y la clave del panel (queda en el registro de ejecución).
5. Implementar como aplicación web, con acceso *Cualquier usuario*. Copiar la dirección que termina en `/exec`.
6. Pegar esa dirección en `index.html` (`CONFIG.url`) y revisar en el mismo bloque `CONFIG` el nombre del responsable del tratamiento (`entidad`), que es el que aparece en la casilla de autorización. Publicar con GitHub Pages.
7. Generar el cartel con `carteles_qr.html` e imprimirlo.

Los detalles están en `LEEME_montaje.md`.

## Verificación antes de un evento

Desde el editor de Apps Script:

- `verificarClaves()` — confirma que las dos claves responden y con qué modelo.
- `pruebaCarga200()` — simula 200 envíos (408 voces) y mide cuánto tarda el procesamiento. Escribe directo en la bandeja, así que **no** prueba la recepción.
- `pruebaRecepcion100()` — manda 100 envíos simultáneos a la aplicación web publicada, pasando por `doPost`, y dice cuántos entraron bien. Necesita la propiedad del script `URL_EXEC` con la dirección que termina en `/exec`.
- `borrarPruebas()` — deja la hoja limpia después de la simulación.
- `reintentarErrores()` — devuelve a la cola las filas que quedaron en error.

Después de pegar una versión nueva de `Codigo.gs`, hay que publicarla: *Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión*. Así la dirección `/exec` no cambia. Si solo se guarda, el formulario sigue hablando con la versión anterior.

## Datos personales

**Este es un ejercicio público.** Lo que la persona responde se proyecta en la sala con su nombre y su organización, y entra en los documentos de incidencia. La casilla de autorización lo dice: nombre, organización y respuesta son públicos.

El formulario pide marcar la casilla de autorización antes de enviar. Desde el 24 de septiembre el formulario ya no muestra el recuadro «Esto es un ejercicio público» ni el texto completo desplegable (quién responde por los datos, qué se recoge, para qué, los derechos del titular y cómo ejercerlos); queda solo la casilla. Los datos del responsable siguen en el bloque `CONFIG` de `index.html` (`entidadLegal`, `direccion`, `telefono`, `pqrsdUrl`, `politicaUrl`), pero hoy el formulario solo usa `entidad`.

Se recogen solo cuatro cosas: nombre, organización, cargo y la respuesta (voz o texto). No se pide cédula, ni correo, ni teléfono.

La nota de voz se trata por su contenido: se transcribe y se trabaja sobre el texto. **No se hace reconocimiento de voz ni ningún tratamiento biométrico.** Los audios quedan en una carpeta de Drive de la entidad, las respuestas en la hoja, y el panel solo entrega datos con la clave. La columna `ocultar` saca una voz del panel sin borrarla.

> El texto lo redactó el equipo del proyecto, no un abogado. Antes de un evento nuevo conviene que la oficina jurídica de la entidad lo revise.
