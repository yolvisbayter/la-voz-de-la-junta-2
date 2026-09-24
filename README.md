# La voz de la Junta

Sistema de captura y visualización de voces para la **Junta de Juntas** del Plan Nacional de Desarrollo 2026–2030 — Cámara de Comercio de Cartagena.

Cada asistente escanea un QR, responde **dos preguntas** (visión y compromiso) con una nota de voz o por escrito, y su respuesta se transcribe automáticamente y se ubica en una de las **nueve palancas** del sistema de inteligencia territorial. El resultado se proyecta en vivo.

## Cómo funciona

```
Celular ──► guarda en el teléfono ──► Apps Script (doPost) ──► Drive (audio + ficha)
                                                                   │
                       cada minuto ──► arma las filas en la hoja "Voces"
                                  ──► Gemini clave 1: audio → texto
                                  ──► Gemini clave 2: texto → palanca, sector, resumen y palabras
                                                                   │
                                Apps Script (doGet, con clave) ──► Panel en pantalla
                                                     ◄── motor de respaldo, si el disparador se detiene
```

Las dos etapas usan **claves de proyectos de Google Cloud distintos**, para que cada una tenga su propio cupo y su propia tarea. El recorrido completo, cada columna de la hoja y cada propiedad están en el [mapa del sistema](MAPA_DEL_SISTEMA.md).

**Para el viernes:** [LEEME_montaje.md](LEEME_montaje.md), sección A, para pasar a la v3, y la [guía del día](GUIA_DEL_DIA.md) para el ensayo y la operación.

## Qué hay en este repositorio

| Ruta | Qué es |
| --- | --- |
| `index.html` | Página de captura. Es la que se publica en GitHub Pages y la que abre el QR. |
| `apps_script/Codigo.gs` | Backend completo: recepción, guardado en Drive, transcripción y clasificación con Gemini, y entrega de datos al panel. Se pega en un proyecto de Google Apps Script. |
| `panel/voz.js`, `panel/voz.css`, `panel/voz.html` | Vista «La voz de la Junta» del panel. Abre con el mismo héroe del inicio, en la paleta de la Cámara, y sigue con tres indicadores —voces recibidas; organizaciones que hablaron, que al tocarlas despliegan la lista con su logo; y un tercero que sigue al filtro Todo / Visión / Compromiso—, la **Nube de palabras** (crecen según cuántas personas las dijeron; al tocar una aparecen las organizaciones que la dijeron) **Palancas y voces** (las nueve palancas, la matriz palanca × sector y el muro de voces) y **Árbol de logos** (las organizaciones que hablaron, la Cámara arriba y las demás por número de voces, en pirámide, ramificado o burbujas, con botón para proyectarlo en una ventana aparte). Incluye el modo proyección. |
| `panel/logos.js` | Catálogo de logos oficiales de las organizaciones invitadas, embebidos como imágenes. La clave de cada entrada es el nombre oficial tal como aparece en `ORGS`, dentro de `voz.js`. Quien no tenga logo sale con un escudo de iniciales. |
| `panel/build.py` | Arma `panel/panel.html` (el panel independiente) y, si está el prototipo como `panel/original.html`, la vista integrada en él. Se detiene con un mensaje claro si algo no calza. |
| `panel/panel.html` | **Panel independiente, ya armado.** Funciona sin el prototipo: es el plan B seguro para proyectar. |
| `panel/plantilla_independiente.html` | Base del panel independiente. |
| `apps_script/appsscript.json` | Manifiesto de referencia del proyecto de Apps Script. |
| `carteles_qr.html` | Generador del cartel A4 con el QR. Se abre en el navegador, se pega la dirección pública y se imprime. |
| `tests/` | Simulador de Apps Script y 63 pruebas automáticas: backend, formulario, panel y cartel. `npm test`. |
| `LEEME_montaje.md` | Montaje desde cero, y paso de la v2 a la v3. |
| `GUIA_DEL_DIA.md` | Ensayo, operación durante el evento y qué hacer si algo falla. |
| `MAPA_DEL_SISTEMA.md` | Recorrido de una respuesta, archivos, columnas, propiedades, parámetros y compatibilidad. |
| `LOGOS_de_donde_salieron.md` | Qué organizaciones tienen logo, cuáles no y por qué. |
| `PLAN.md` | Estado del proyecto, decisiones y pendientes. |
| `AUDITORIA_24sep.md` | Registro de la auditoría y de todas las correcciones. |

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
- **El prototipo del sistema de inteligencia territorial**, ni el panel armado dentro de él: no es parte de este repositorio (`.gitignore` lo deja afuera). Para armarlo: poner el prototipo como `panel/original.html` y ejecutar `python3 panel/build.py`. El panel independiente, `panel/panel.html`, sí está.
- **Las respuestas de las personas.** No están aquí ni lo estarán.

Quien clone este repositorio obtiene **el sistema completo, no los datos**. Las respuestas viven en la hoja y en la carpeta de Drive de la entidad, y solo las ve quien tenga permiso sobre ellas.

## Montaje rápido

1. Crear una hoja de cálculo en Google Sheets y copiar su ID.
2. Crear un proyecto en [script.google.com](https://script.google.com), pegar `apps_script/Codigo.gs` y poner ese ID en `SHEET_ID`.
3. En *Propiedades del script*, agregar `GEMINI_API_KEY` (transcripción) y `GEMINI_API_KEY_2` (clasificación). Deben ser de **dos proyectos de Google Cloud distintos**: los límites de Gemini se aplican por proyecto, no por clave, así que dos claves del mismo proyecto comparten cupo y no sirven de nada.
4. Ejecutar `configurar()`. Crea la hoja `Voces`, la carpeta de audios y la bandeja en Drive, el disparador de cada minuto y la clave del panel (queda en el registro de ejecución). Se puede volver a correr sin perder nada.
5. Implementar como aplicación web, con acceso *Cualquier usuario*. Copiar la dirección que termina en `/exec` y guardarla también en la propiedad `URL_EXEC`.
6. Pegar esa dirección en `index.html` (`CONFIG.url`) y revisar en el mismo bloque `CONFIG` el nombre del responsable del tratamiento (`entidad`) y la `ronda`. Publicar con GitHub Pages.
7. Ejecutar `diagnostico()`: dice qué está bien y qué falta.
8. Generar el cartel con `carteles_qr.html` e imprimirlo.

Los detalles están en `LEEME_montaje.md`.

## Verificación antes de un evento

Desde el editor de Apps Script:

- `diagnostico()` — revisa hoja, carpetas, claves, disparador, latido y la última falla de Gemini, y dice qué arreglar.
- `verificarClaves()` — confirma que las dos claves responden y con qué modelo.
- `probarTranscripcion()` — transcribe la última nota de voz recibida y muestra el resultado. Para el ensayo con un Android y un iPhone.
- `pruebaCarga200()` — simula 200 envíos (408 voces) y mide cuánto tarda el procesamiento. Escribe directo en la bandeja, así que **no** prueba la recepción.
- `pruebaRecepcion100()` — manda 100 envíos simultáneos a la aplicación web publicada, pasando por `doPost`, y dice cuántos entraron bien. Necesita la propiedad del script `URL_EXEC` con la dirección que termina en `/exec`.
- `borrarPruebas()` — borra las filas y fichas de prueba (id `prueba-`, incluidas las del formulario con `?ensayo=1`).
- `archivarEnsayo()` — copia la hoja a una pestaña «Ensayo …» y deja `Voces` vacía. Solo antes de abrir el formulario.
- `reintentarErrores()` — devuelve a la cola las filas que quedaron en error.
- `procesarAhora()`, `activarMotor()`, `pausarMotor()`, `revisarDuplicados()` — ver la [guía del día](GUIA_DEL_DIA.md).

Y en el repositorio, `npm test` corre las 63 pruebas automáticas contra un simulador de Apps Script y en Chromium. GitHub Actions las corre en cada envío.

Después de pegar una versión nueva de `Codigo.gs`, hay que publicarla: *Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión*. Así la dirección `/exec` no cambia. Si solo se guarda, el formulario sigue hablando con la versión anterior.

## Datos personales

**Este es un ejercicio público.** Lo que la persona responde se proyecta en la sala con su nombre y su organización, y entra en los documentos de incidencia. La casilla de autorización lo dice: nombre, organización y respuesta son públicos.

El formulario pide marcar la casilla de autorización antes de enviar. Desde el 24 de septiembre el formulario ya no muestra el recuadro «Esto es un ejercicio público» ni el texto completo desplegable (quién responde por los datos, qué se recoge, para qué, los derechos del titular y cómo ejercerlos); queda solo la casilla. Los datos del responsable siguen en el bloque `CONFIG` de `index.html` (`entidadLegal`, `direccion`, `telefono`, `pqrsdUrl`, `politicaUrl`), pero hoy el formulario solo usa `entidad`.

Se recogen solo cuatro cosas: nombre, organización, cargo y la respuesta (voz o texto). No se pide cédula, ni correo, ni teléfono.

La nota de voz se trata por su contenido: se transcribe y se trabaja sobre el texto. **No se hace reconocimiento de voz ni ningún tratamiento biométrico.** Los audios quedan en una carpeta de Drive de la entidad, las respuestas en la hoja, y el panel solo entrega datos con la clave. La columna `ocultar` saca una voz del panel sin borrarla.

> El texto lo redactó el equipo del proyecto, no un abogado. Antes de un evento nuevo conviene que la oficina jurídica de la entidad lo revise.
