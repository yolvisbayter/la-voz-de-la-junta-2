# Mapa del sistema

Qué pieza hace qué, por dónde pasa cada respuesta y dónde queda cada dato. Versión 3 (25 de septiembre de 2026).

## Recorrido de una respuesta

```
 Teléfono (index.html, GitHub Pages)
   │  1. guarda la respuesta en el teléfono (IndexedDB) ANTES de enviarla
   │  2. POST text/plain ──► Apps Script doPost
   │                          ├─ guarda cada nota de voz en Drive: «La voz de la Junta - audios»
   │                          └─ deja una ficha JSON en Drive: «La voz de la Junta - bandeja»
   │  3. la borra del teléfono solo cuando el servidor responde {ok:true}
   │     (si no, reintenta cada 10–20 s; al volver la conexión; al reabrir la página)
   ▼
 Disparador de cada minuto ─► procesarPendientes
   │  si no hay trabajo, sale en milisegundos (cuida el tope diario de Google)
   │  a. pasa las fichas de la bandeja a filas de la hoja «Voces»
   │  b. etapa 1 · Gemini, clave 1: nota de voz → texto            (hasta 25 en paralelo)
   │  c. etapa 2 · Gemini, clave 2: texto → palanca, sector, resumen, palabras
   │                                                               (de a 20 en una llamada)
   │  d. marca cada fila: pendiente / listo / error / sin respuesta
   ▼
 Panel (panel.html o el prototipo) ── cada 20 s ──► Apps Script doGet?accion=datos&token=…
   │  dibuja nube, palancas, matriz, muro y árbol de logos
   └─ si el disparador no late y hay trabajo ──► doGet?accion=procesar (motor de respaldo)
```

## Archivos

| Archivo | Qué es | Quién lo usa |
| --- | --- | --- |
| `index.html` | Formulario de captura | El público, por el QR (GitHub Pages) |
| `apps_script/Codigo.gs` | Backend completo | Se pega en el proyecto de Apps Script |
| `apps_script/appsscript.json` | Manifiesto de referencia (zona horaria, V8, aplicación web) | Opcional, al montar desde cero |
| `panel/voz.js`, `voz.css`, `voz.html` | La vista «La voz de la Junta» | `build.py` |
| `panel/logos.js` | 52 logos embebidos | `build.py` |
| `panel/plantilla_independiente.html` | Base del panel independiente | `build.py` |
| `panel/build.py` | Arma `panel.html` y, si está el prototipo, la vista integrada | El equipo, después de cambiar el panel |
| `panel/panel.html` | **Panel independiente, ya armado** | El operador de pantalla |
| `carteles_qr.html` | Generador del cartel A4 con el QR | Se abre en el navegador e imprime |
| `tests/` | Simulador de Apps Script y 66 pruebas automáticas | `npm test`, GitHub Actions |
| `LEEME_montaje.md` | Montaje, y paso de la v2 a la v3 | El equipo |
| `GUIA_DEL_DIA.md` | Ensayo, operación y qué hacer si… | Los operadores |
| `PLAN.md` | Estado, decisiones y pendientes | El equipo |
| `LOGOS_de_donde_salieron.md` | Qué organizaciones tienen logo y cuáles no | El equipo |
| `AUDITORIA_24sep.md` | Registro de la auditoría y las correcciones | El equipo |

No están en el repositorio: el prototipo del sistema de inteligencia territorial (`panel/original.html`), las claves y las respuestas.

## Hoja «Voces»: columnas

Las columnas se buscan **por nombre**, no por posición. Si el equipo agrega una columna, nada se corre. Las que falten se agregan solas al final.

| Columna | Quién la escribe | Qué guarda |
| --- | --- | --- |
| `id` | Sistema | Identificador único de la respuesta. Las de prueba empiezan por `prueba-` |
| `recibido` | Sistema | Cuándo entró a la hoja |
| `nombre`, `organizacion`, `rol` | Formulario | Lo que escribió la persona |
| `vision_escrita`, `compromiso_escrita` | Formulario | La respuesta escrita, si la hay |
| `*_audio_url`, `*_audio_id` | Sistema | Enlace e id de la nota de voz en Drive |
| `*_transcripcion` | IA, etapa 1 | Lo que dijo la persona. `(inaudible)` si no se entendió nada |
| `*_palanca`, `*_palanca_2`, `*_sector`, `*_resumen`, `*_confianza` | IA, etapa 2 | La clasificación |
| `*_palabras` | IA, etapa 2 | De una a tres palabras de impacto, separadas por coma |
| **`*_palanca_validada`** | **Equipo** | Si se llena, manda sobre la palanca de la IA. Acepta la clave (`reglas`) o el nombre («Reglas claras») |
| `estado_ia` | Sistema | `pendiente`, `listo`, `error: …` o `sin respuesta` |
| `intentos` | Sistema | Fallas reales. Con 8 pasa a error. La saturación de Gemini no cuenta |
| **`ocultar`** | **Equipo** | Casilla. Marcada, la voz sale del panel sin borrarse. También vale escribir TRUE, sí, x o 1 |
| **`estado`**, **`notas_equipo`** | **Equipo** | Para uso del equipo (arranca en «sin verificar») |
| `consentimiento` | Sistema | «sí»: el formulario no deja enviar sin la casilla |
| `enviado` | Formulario | Hora del teléfono al enviar (v3). Prueba de la autorización |

## Propiedades del script

| Propiedad | Quién la pone | Para qué |
| --- | --- | --- |
| `GEMINI_API_KEY` | A mano | Clave del proyecto 1: transcripción |
| `GEMINI_API_KEY_2` | A mano | Clave del proyecto 2: clasificación |
| `URL_EXEC` | A mano (opcional) | Dirección `/exec`, para `pruebaRecepcion100()` |
| `PANEL_TOKEN` | `configurar()` | Clave del panel |
| `CARPETA_ID`, `BANDEJA_ID` | `configurar()` | Carpetas de Drive |
| `CUARENTENA_ID` | Sistema | Carpeta de fichas que no se pudieron leer |
| `MODELO_AUDIO`, `MODELO_TEXTO` | Sistema | El último modelo de Gemini que respondió bien (se prueba primero) |
| `HAY_FICHAS`, `PENDIENTES`, `ULTIMA_REVISION` | Sistema | Señales para que el disparador sepa si hay trabajo |
| `LATIDO` | Sistema | Última vez que corrió el disparador (el panel lo muestra) |
| `ESTADO_MOTOR`, `ULTIMO_FALLO`, `EXITO_AUDIO`, `EXITO_TEXTO` | Sistema | Estado para el panel y `diagnostico()` |

## Apps Script: lo que atiende la aplicación web

| Petición | Clave | Devuelve |
| --- | --- | --- |
| `POST` (el formulario) | No | `{ok:true}` o `{ok:false,error}`. Un reenvío con el mismo id responde `ok` sin duplicar |
| `GET` sin `accion` | No | `{ok:true, servicio, version}`: sirve para ver que está vivo |
| `GET ?accion=datos&token=…` | Sí | Voces para el panel y estado del motor |
| `GET ?accion=estado&token=…` | Sí | Estado del motor, incluido cuántos disparadores hay |
| `GET ?accion=procesar&token=…` | Sí | Corre el proceso hasta 45 s (motor de respaldo) |
| `GET ?accion=reintentar&token=…` | Sí | Devuelve a la cola las filas en error |

Todas aceptan `&callback=nombre` (JSONP), que es como lee el panel.

## Parámetros de dirección

**Formulario**

| Parámetro | Qué hace |
| --- | --- |
| `?ensayo=1` | Respuesta de ensayo: id `prueba-`, no bloquea el teléfono. Se borra con `borrarPruebas()` |
| `?reiniciar=1` | Quita de ese teléfono la marca de «ya respondió» |

**Panel**

`?fuente=<…/exec>&clave=<…>`, más:

| Parámetro | Qué hace |
| --- | --- |
| `&proyectar=1` | Abre en modo proyección |
| `&seccion=nube`, `analisis` o `arbol` | Sección con la que abre |
| `&forma=piramide`, `ramas` o `burbujas` | Forma del árbol |
| `&rotar=30` | En proyección, cambia de sección cada 30 s |
| `&refresco=20` | Segundos entre actualizaciones (de 3 a 300) |
| `&vista=voz` | Solo dentro del prototipo: abre directo en la vista |

Sin `fuente`, el panel muestra datos de demostración, rotulados como tales. Con una `fuente` que no es del Apps Script, avisa y no muestra nada inventado.

## Servicios de los que depende

| Servicio | Para qué | Si falla |
| --- | --- | --- |
| Google Apps Script | Recepción, motor y datos del panel | El formulario guarda en el teléfono y reintenta; el panel muestra lo último |
| Google Drive | Audios y fichas | Igual que arriba |
| Google Sheets | La hoja «Voces» | El motor no avanza; las fichas esperan en la bandeja |
| Gemini, proyecto 1 | Transcribir | Las notas esperan; se reintentan cada minuto; 4 modelos de respaldo |
| Gemini, proyecto 2 | Clasificar | Igual; una tanda fallida se reparte de a una |
| GitHub Pages | Servir el formulario | Sin formulario. Plan B: el formulario de Jotform que quedó listo en la primera versión, <https://form.jotform.com/262635579619068>, sin transcripción ni panel automáticos (ver `GUIA_DEL_DIA.md`) |
| Google Fonts | Tipografía | Se usa la tipografía del sistema, sin romper nada |
| cdnjs (qrcodejs) | Solo para generar el cartel | El generador lo avisa; el cartel se imprime antes del evento |

## Compatibilidad entre versiones

| | Backend v2 | Backend v3 |
| --- | --- | --- |
| **Formulario v2** | Funciona | Funciona |
| **Formulario v3** | Funciona (sin la columna `enviado`) | Funciona |
| **Panel v2** | Funciona | Funciona |
| **Panel v3** | Funciona; la barra avisa que falta el backend v3 y no hay motor de respaldo | Funciona completo |
