# Auditoría y correcciones — jueves 24 de septiembre de 2026

Registro paso a paso de lo que se hizo sobre el repositorio `la-voz-de-la-junta-2` la víspera de la Junta de Juntas (viernes 25).

- Rama: `claude/practical-hopper-brypwz`
- Commits (del más viejo al más nuevo):
  - `54be518` — Corrige fallas de la auditoría antes del evento
  - `69dd5eb` — Quita del formulario el aviso público y la autorización completa
  - `fd551f3` — Agrega el registro paso a paso de la auditoría del 24 de septiembre
  - `cff1a8e` — Backend v3: motor liviano, respaldo desde el panel y operación
  - `e856779` — Formulario v3: cola en IndexedDB, modo ensayo y grabación robusta
  - `e987496` — Panel v3: versión independiente, estado del motor y operación
  - `63877ae` — Cartel QR validado, catálogo de logos y sigla repetida
  - `e2cae33` — Pruebas automáticas: script único y GitHub Actions
  - `fdc35e7` — Documentación v3: montaje, guía del día, mapa del sistema
  - `98ed99a` — Revisión final: respaldo no-cors más seguro, operador estable, WebKit
  - `4b59649` — Sonda bajo saturación, .nojekyll y cuentas de pruebas al día
  - `7723aa3` — Panel: una fuente mal escrita avisa en vez de mostrar datos de prueba
  - `d22824b` — Pruebas: la verificación del panel armado compara contra el disco
  - `726c16c` — Recepción más liviana: sin búsqueda en Drive por cada envío
  - (este mismo commit) — Registro de la auditoría al día

---

## Paso 1. Lectura completa del código

Se leyeron los 11 archivos del repositorio (unas 2.100 líneas):

| Archivo | Qué es |
| --- | --- |
| `apps_script/Codigo.gs` | Backend: recepción, Drive, transcripción y clasificación con Gemini, datos para el panel |
| `index.html` | Formulario de captura (el que abre el QR) |
| `panel/voz.js`, `voz.css`, `voz.html` | Vista «La voz de la Junta» del panel |
| `panel/logos.js` | 52 logos embebidos |
| `panel/build.py` | Arma el panel dentro del prototipo |
| `carteles_qr.html` | Generador del cartel con QR |
| `README.md`, `PLAN.md`, `LEEME_montaje.md` | Documentación |

Además se comprobó con un script que:

- las 52 claves de `logos.js` coinciden exactamente con nombres de `ORGS` en `voz.js`;
- la lista de autocompletado del formulario y `ORGS` tienen las mismas 60 organizaciones;
- solo una sigla está repetida (`ACO`, para ACOPI y Acodrés), sin efecto hoy porque ambas tienen logo.

## Paso 2. Hallazgos de la auditoría

### Críticos (podían fallar en pleno evento)

1. **La prueba de carga no probaba la recepción.** `pruebaCarga200()` escribe directo en la bandeja de Drive y se salta `doPost`. Los 200 envíos simultáneos desde teléfonos nunca se habían probado, y Apps Script admite unas 30 ejecuciones simultáneas por usuario.
2. **El formulario podía dar por enviada una respuesta que no llegó.** Si el servidor devolvía algo que no era JSON (una página de error de Google), se tomaba como éxito; el envío de respaldo `no-cors` también se daba siempre por exitoso. El teléfono quedaba marcado como «ya respondió» y la respuesta se perdía.
3. **El envío no tenía tiempo límite.** Con wifi lento, el botón podía quedarse en «Enviando…» sin pasar a la cola de reintento.
4. **Bucle con JSON inválido de Gemini.** Si la clasificación devolvía algo ilegible, no se sumaban intentos y la misma tanda se repetía durante 4 minutos, en cada ejecución, sin pasar nunca a error.
5. **Un 503 sí gastaba intentos, y en segundos.** El `PLAN.md` decía lo contrario. En una saturación de Gemini una fila podía llegar a 8 intentos, y quedar en error, en menos de un minuto.
6. **Un audio borrado o dañado detenía todo el proceso** cada minuto, para todas las respuestas.
7. **Ordenar o borrar filas mientras corría el proceso cruzaba los datos.** Los resultados se escribían por posición, a partir de una lectura hecha antes de llamar a Gemini.
8. **Logos equivocados.** La búsqueda de organizaciones era demasiado amplia:
   - «Cámara de Comercio de Bogotá» → Cámara de Comercio de **Cartagena**
   - «Grupo de Investigación UTB» → **Invest In Cartagena**
   - «Gobernación del Atlántico» → Gobernación de **Bolívar**
   - «Distrito de riego María la Baja» → **Alcaldía**
   - «Cámara» → **CCI**

### Importantes

9. **Inyección de fórmulas:** un nombre que empezara por `=` entraba como fórmula en la hoja.
10. **El árbol proyectado en otra ventana no se actualizaba**: quedaba congelado en el momento de abrirlo.
11. **El muro de voces parpadeaba cada 20 segundos**: la animación de entrada se repetía en todas las tarjetas.
12. **El texto legal prometía cosas que no se cumplían el día del evento**: audios «en una carpeta de la Cámara» (están en una cuenta personal) y datos que «no se entregan a terceros» (con Gemini en nivel gratuito, Google puede usar los audios).
13. **El bloqueo entre ejecuciones no era confiable** (usaba la caché, que no es atómica).
14. **`build.py` puede fallar sin avisar** si no encuentra los puntos donde inserta el código.

### Menores (quedan para después del evento)

15. Fichas ilegibles se mandan a la papelera sin registro.
16. El servidor no exige el cargo ni al menos una respuesta.
17. La hora del teléfono (`cliente`) se envía pero no se guarda.
18. La nube dice «personas» pero cuenta voces, y presta palabras a las voces que no traen ninguna.
19. Con la clave del panel mal puesta, la pantalla dice «Sin conexión» en vez de «clave incorrecta».
20. Sigla `ACO` repetida.
21. `LEEME_montaje.md` es de la versión anterior; el `PLAN.md` nombra archivos que no están en el repo.
22. `.vz-proc` depende de una variable de color del prototipo.

## Paso 3. Plan de corrección

Se propuso un plan en dos fases, sin editar nada hasta tener aprobación:

- **Fase 1 (antes del evento):** puntos 1 a 10 del plan — envío confiable, intentos bien contados, audio dañado aislado, escritura por id con candado, fórmulas neutralizadas, búsqueda de organizaciones estricta, árbol y muro, prueba de recepción real y protocolo para el equipo.
- **Fase 2 (después del evento):** los hallazgos menores, `build.py` y la documentación vieja.
- **Punto 11, decisión de la Cámara:** activar la facturación de Gemini o ajustar el texto legal.

Se aprobó la fase 1 («adelante»).

## Paso 4. Correcciones en el backend (`apps_script/Codigo.gs`)

1. **Candado real.** `procesarPendientes()` usa `LockService` en lugar de la caché. Si la ejecución anterior sigue trabajando, la nueva no arranca. `borrarPruebas()` y `reintentarErrores()` esperan hasta 2 minutos a que termine el proceso antes de tocar la hoja.
2. **Escritura por id.** Nueva función `aplicarPorId_`: después de que Gemini responde, vuelve a leer la hoja, busca cada fila por su `id` y escribe ahí. Si alguien ordena la hoja o borra una fila en medio, cada resultado cae en su fila.
3. **Fallas reales vs. saturación.**
   - `enParalelo_` distingue: 429, 5xx, 403, 404 y 408 son **transitorias** (culpa de Gemini o de la configuración); 400, respuesta vacía o ilegible son **reales** (culpa de la respuesta misma).
   - Las transitorias **no gastan intentos**. Si una etapa no logra nada por saturación, se detiene hasta el minuto siguiente en vez de insistir.
   - Para que una respuesta que siempre falla no quede en cola para siempre, `contarTransitorias_` lleva la cuenta entre ejecuciones: a los 10 minutos seguidos de fallas transitorias se cuenta un intento.
   - Una respuesta que falla dentro de una ejecución no se reintenta en esa misma ejecución, sino en la siguiente.
4. **Clasificación ilegible o incompleta.** Si Gemini devuelve JSON inválido, o deja respuestas por fuera, esas respuestas suman un intento y se reintentan al minuto siguiente. También se descarta una palanca que no esté en la lista.
5. **Audio dañado aislado.** La lectura de cada audio va en su propio `try/catch`: si falla, solo esa respuesta cuenta una falla real.
6. **Fórmulas neutralizadas.** Nueva función `seguro_`: a todo texto que empiece por `=`, `+`, `-`, `@`, tabulación o retorno se le antepone un apóstrofo, que la hoja no muestra. Se aplica al ingresar las fichas y en cada reescritura de columnas.
7. **`id` validado** en `doPost` (letras, números y guiones, de 8 a 64 caracteres).
8. **Nueva prueba `pruebaRecepcion100()`.** Manda 100 envíos simultáneos a la aplicación web publicada, pasando por `doPost`, y registra cuántos entraron bien y por qué fallaron los demás. Necesita la propiedad del script `URL_EXEC`. Los envíos llevan id `prueba-`, así que `borrarPruebas()` los limpia.
9. Se quitó la función `marcarIntento_`, que ya no se usa, y se agregó al encabezado del archivo el resumen de estos cambios.

## Paso 5. Correcciones en el formulario (`index.html`)

1. **Solo cuenta como enviada si el servidor responde `{ok:true}`.** Cualquier otra respuesta deja la respuesta en la cola del teléfono. Reenviar no duplica: el servidor descarta las repetidas por su id.
2. **Tiempo límite de 90 segundos** (`CONFIG.esperaSeg`). Si el servidor no responde en ese tiempo, la respuesta pasa a la cola.
3. **Reintento con espera al azar** de 10 a 20 segundos, para que los teléfonos que fallaron juntos no vuelvan a llegar juntos.
4. **Respaldo `no-cors` acotado.** No se pudo comprobar desde el entorno de trabajo que el Apps Script permita CORS (la red bloquea `script.google.com`). Por eso, si el mismo envío falla 3 veces seguidas por error de red, se manda en modo `no-cors`, como hacía la versión anterior. El conteo de fallas se guarda con la respuesta en la cola.

## Paso 6. Correcciones en el panel (`panel/voz.js`, `panel/voz.css`)

1. **Búsqueda de organizaciones estricta.** Una organización se reconoce solo si el nombre o una de sus formas aparece completo, y a lo sumo rodeado de palabras de relleno o de lugar (*la, de, del, Cartagena, Bolívar, seccional, capítulo, Colombia…*). Si hay duda, sale el escudo de iniciales. Resultados comprobados:
   - Ya **no** se confunden: Cámara de Comercio de Bogotá, Grupo de Investigación UTB, Gobernación del Atlántico, Distrito de riego María la Baja, «Fundación», «Cámara», ISA Intercolombia, Invest in Colombia.
   - Se **siguen** reconociendo: los 60 nombres oficiales, «la cámara de comercio de cartagena», «CCC», «ANDI seccional Bolívar», «Sociedad Portuaria Regional de Cartagena», «Reficar», «Cotelco Capítulo Bolívar», entre otros.
2. **Ventana del árbol en vivo.** La ventana aparte se redibuja en cada refresco del panel y sigue la forma elegida (pirámide, ramificado o burbujas).
3. **Burbujas: caben todas.** Error encontrado al probar, que ya estaba antes: las organizaciones que no cabían desaparecían sin aviso (con 30 organizaciones de igual tamaño se veían solo 11). Ahora todas las burbujas se achican por igual hasta que quepan. Probado de 1 a 60 organizaciones, en menos de 35 ms. También se fijó `box-sizing:border-box` en la burbuja para que el borde y el relleno no la agranden y se monte sobre las vecinas.
4. **Muro sin parpadeo.** Solo entra con animación la tarjeta nueva, o la que acaba de ser ubicada en su palanca.

## Paso 7. Documentación

- `README.md`: aclaración de que `pruebaCarga200()` no prueba la recepción; nueva `pruebaRecepcion100()`; cómo publicar una nueva versión sin cambiar la dirección `/exec`.
- `PLAN.md`: sección «Correcciones de la auditoría del jueves 24» y sección «Protocolo del día».

## Paso 8. Pruebas

| Qué | Cómo | Resultado |
| --- | --- | --- |
| Backend | Simulador de Apps Script (hoja, Drive, candado, caché y Gemini falsos) | 6 de 6 casos: flujo normal con fórmula neutralizada; JSON inválido → una llamada por minuto y error tras 8; 503 → no gasta intentos (uno cada 10 minutos); audio borrado no bloquea; resultados caen en su fila aunque se reordene la hoja; candado |
| Formulario | Chromium con respuestas simuladas | `ok:true` → enviado; página HTML → queda en cola; error y luego éxito → se vacía la cola; sin CORS → 3 intentos y respaldo `no-cors` |
| Panel | Chromium, armado con un prototipo mínimo de reemplazo | Sin errores; la ventana del árbol pasa de 14 a 15 organizaciones sola; 0 burbujas montadas; muro sin repetir animación |
| Organizaciones | Script con 24 casos | Todos correctos |

**No se probó en el Apps Script real ni con teléfonos**: el entorno de trabajo no tiene acceso a `script.google.com`. Eso se hace en el ensayo.

## Paso 9. Cambio pedido en la sección «Autorización» del formulario

A pedido, se quitaron de `index.html`:

- el recuadro «Esto es un ejercicio público…»;
- el desplegable «Ver la autorización completa» con su texto.

Se quitaron también el código y el CSS que los armaban (si no, el script fallaba al no encontrarlos y el formulario dejaba de enviar). La casilla decía «para los fines que se describen abajo»; como abajo ya no hay nada, ahora dice «para los fines de este ejercicio». Sigue aclarando que nombre, organización y respuesta son públicos.

Los datos del responsable (`entidadLegal`, `direccion`, `telefono`, `pqrsdUrl`, `politicaUrl`) siguen en `CONFIG`, sin usarse, por si se decide volver a mostrarlos. `README.md` y `PLAN.md` quedaron al día. Probado en Chromium con pantalla de celular: sin errores y el envío funciona.

> **Riesgo:** la Ley 1581 pide autorización *informada*. El texto quitado explicaba quién responde por los datos, para qué se usan, los derechos del titular y el trato de la nota de voz. Con la casilla sola, la prueba del consentimiento queda más débil. Un punto medio posible: un enlace de una línea a la política de datos de la Cámara dentro de la casilla.

## Paso 10. Lo que falta hacer

**Hoy, antes y durante el ensayo:**

1. Pegar el nuevo `Codigo.gs` en Apps Script y publicarlo como **nueva versión de la misma implementación**: *Implementar → Gestionar implementaciones → editar (lápiz) → Nueva versión*. Si solo se guarda, el formulario sigue usando el código viejo.
2. Agregar en *Propiedades del script* la propiedad `URL_EXEC` con la dirección que termina en `/exec`.
3. Subir el nuevo `index.html` a GitHub Pages y volver a generar el panel con `build.py`.
4. En el ensayo: `verificarClaves()`, luego `pruebaRecepcion100()` y revisar cuántos envíos entraron bien; después `borrarPruebas()`.
5. Antes de abrir el formulario: `borrarPruebas()` y revisar que la hoja quede solo con el encabezado.
6. Durante el evento: **no ordenar ni borrar filas** en la hoja; usar *Datos → Vistas de filtro*.

**Decisiones pendientes:**

- Activar la facturación de los dos proyectos de Gemini antes del evento, o ajustar el texto legal (punto 12 de los hallazgos).
- Si se vuelve a mostrar algún texto de autorización, o al menos un enlace a la política de datos.

**Después del evento (fase 2):** el hallazgo 14 (`build.py`) y los menores, del 15 al 22. El 13 (bloqueo) ya quedó resuelto con el candado real.

---

## Paso 11. La noche del jueves: versión 3

Pedido: rehacer y mejorar todo el sistema durante la noche, cubriendo cualquier inconveniente que pudiera surgir en el evento, con todo listo a las 6 de la mañana.

**Criterio:** reforzar lo que ya funcionaba, no reescribirlo desde cero. Se mantuvieron la dirección `/exec`, las columnas de la hoja, los parámetros del panel y el formato del envío. Así, cualquier combinación de piezas viejas y nuevas sigue funcionando, y volver atrás toma dos minutos. El conocimiento de clasificación (palancas, términos, desempates, ejemplos y prompt) quedó **idéntico**; se comprobó comparando uno por uno.

### 11.1 Backend (`apps_script/Codigo.gs` v3)

1. **Tope diario de Google.** Con el disparador de cada minuto leyendo la hoja en cada vuelta, una cuenta personal (90 minutos al día de disparadores) podía quedarse sin ejecuciones en pleno evento. Ahora el formulario deja una señal al enviar y el motor guarda cuántas filas quedan pendientes. Sin trabajo, el disparador sale sin tocar Drive ni la hoja. Cada 10 minutos igual revisa todo.
2. **Motor de respaldo.** Nuevas acciones de la aplicación web, todas con la clave del panel: `accion=procesar`, `accion=estado` y `accion=reintentar`. El disparador deja un latido; si el latido se detiene y hay trabajo, el panel pide el proceso.
3. **Tope de 6 minutos.** Antes de cada llamada a Gemini se revisa que alcance el tiempo. Una ejecución nunca se acerca al límite de Apps Script, que la cortaría a mitad de camino.
4. **Filas según el encabezado real.** Si el equipo agrega una columna, nada se corre. Las columnas nuevas (`enviado`) se agregan al final, solas, y la hoja crece sola si le faltan filas.
5. **Tanda de clasificación repartida.** Si la IA no puede con las 20 respuestas de una tanda (vacía, ilegible, incompleta o bloqueada por una sola respuesta), se reparten de a una en la misma ejecución.
6. **Casos del día real:**
   - nota inaudible: queda marcada `(inaudible)` y no se queda «procesando» para siempre;
   - ficha dañada: va a una carpeta de cuarentena, no a la papelera;
   - reenvío del mismo teléfono: no duplica audios;
   - clave de Gemini inválida: no gasta intentos y queda registrada;
   - tipo de audio: se normaliza aunque Drive diga `video/webm`;
   - `ocultar` y palanca validada: valen aunque se escriban a mano de cualquier forma («TRUE», «sí», «Reglas claras»);
   - respuesta sin contenido: queda en `sin respuesta`, en vez de `pendiente` para siempre;
   - hora del teléfono: se guarda en `enviado`.
7. **Saturación larga.** Mientras Gemini siga saturado, cada minuto se prueba con una sonda de 3 notas de voz en vez de 25. Así una saturación de horas no agota el cupo diario de 20.000 llamadas externas de Apps Script. Apenas la sonda sale bien, se vuelve a tandas completas en la misma ejecución.
8. **Funciones de operación:** `diagnostico()`, `procesarAhora()`, `activarMotor()`, `pausarMotor()`, `archivarEnsayo()`, `probarTranscripcion()` y `revisarDuplicados()`. `borrarPruebas()` borra por bloques y no falla aunque todas las filas sean de prueba.
9. `apps_script/appsscript.json` de referencia.

### 11.2 Formulario (`index.html` v3)

1. **Cola en IndexedDB.** Cada respuesta se guarda en el teléfono antes de enviarse y se borra solo cuando el servidor confirma. Antes estaba en `localStorage`, donde dos notas de voz de iPhone podían no caber, y entonces se perdían al cerrar la página. Lo pendiente de la versión anterior se migra y se envía.
2. **Tiempo de espera según el tamaño.** Con audio espera más, para que una red lenta pero viva alcance a subirlo en vez de cortarse y volver a empezar. Reintenta al volver la conexión y al volver a la página, y avisa antes de cerrar con respuestas pendientes.
3. **Modo ensayo** (`?ensayo=1`): id `prueba-`, no bloquea el teléfono. **Ronda:** la marca de «ya respondió» vale por evento, así que los teléfonos del ensayo del jueves pueden responder el viernes. `?reiniciar=1` quita la marca.
4. **Grabación:**
   - sin doble arranque;
   - una grabación fallida no borra la anterior;
   - se guarda lo grabado si el micrófono se corta (una llamada) o la persona sale de la página;
   - si la persona negó el permiso, no se le vuelve a pedir;
   - aviso para navegadores de otras apps (WhatsApp, Instagram);
   - reducción de ruido del micrófono.
5. Límites de largo iguales a los del servidor.

### 11.3 Panel (`panel/` v3)

1. **Panel independiente** `panel/panel.html`: funciona sin el prototipo. Lo arma `build.py` con `plantilla_independiente.html`.
2. **`build.py`** (hallazgo 14): se detiene con un mensaje claro si el prototipo no calza, y si el último `<script>` es externo pone la vista en un `<script>` propio.
3. **Barra del operador**, que la sala no ve: latido del motor, cola, errores y última falla de Gemini, con los botones **Procesar ahora** y **Reintentar errores**.
4. **Datos:**
   - un pedido a la vez;
   - respuestas tardías descartadas sin errores;
   - últimos datos guardados para arrancar sin conexión;
   - solo redibuja si algo cambió;
   - aviso de clave incorrecta (hallazgo 19).
5. **Proyección:**
   - la pantalla no se apaga (Wake Lock);
   - atajos 1, 2, 3, P y R;
   - parámetros `seccion`, `forma`, `rotar`, `proyectar` y `refresco`.
6. **Nube** (hallazgo 18): cuenta personas, no voces, y ya no inventa palabras para las voces que no traen. Las voces fallidas no salen en el muro.
7. **CSS:** dos reglas rotas por restos de código borrado. En modo oscuro, el botón «Todo» era marino sobre marino.
8. **Sigla repetida** (hallazgo 20): Acodrés usa `ACD`.
9. El hallazgo 22 no era un problema: `--warn` sí está definido en la paleta de `voz.css`.

### 11.4 Cartel y archivos que faltaban

- `carteles_qr.html`:
  - exige https;
  - rechaza la dirección del Apps Script o una con `?ensayo`;
  - avisa si no cargó la librería del QR;
  - escribe la dirección bajo el QR y deja un enlace para probarla.
- `LOGOS_de_donde_salieron.md`: el `PLAN.md` lo citaba y no existía. Se generó del catálogo real: 52 con logo, 8 sin logo y por qué. La fuente exacta de cada logo no estaba registrada, y así se dice.
- `.gitignore`, para no subir el prototipo.

### 11.5 Pruebas automáticas (`tests/`)

- **Simulador de Apps Script**: hoja con límites reales de filas y columnas, detección de fórmulas, Drive, propiedades, caché, candado, disparadores, un Gemini falso y un reloj que se puede adelantar.
- **66 pruebas**:

  | Parte | Pruebas |
  | --- | --- |
  | Backend | 33 |
  | Formulario, en Chromium con micrófono falso; y en WebKit, el motor de Safari, en GitHub Actions (11 pasan y 3 se saltan porque ese WebKit no graba audio) | 14 |
  | Panel, en Chromium | 16 |
  | Cartel | 3 |

- `npm test` (`tests/correr_todo.sh`): sintaxis de todo, que `panel/panel.html` esté al día con sus piezas, y las 66 pruebas. `.github/workflows/pruebas.yml` las corre en GitHub en cada envío.
- En el camino, las pruebas encontraron y se corrigieron:
  - el mensaje del operador que se borraba en el siguiente refresco;
  - la nube de demostración vacía;
  - el botón activo invisible en modo oscuro del panel independiente;
  - una franja sobrante al proyectar;
  - el respaldo `no-cors` del formulario, que con un solo envío a ciegas podía perder una respuesta si Google devolvía un error bajo carga: ahora reenvía en tres ciclos distintos;
  - la barra del operador, que rearmaba sus botones en cada refresco y podía perder un clic;
  - una `?fuente=` mal escrita en la dirección del panel, que antes mostraba datos de demostración en el proyector: ahora avisa, y acepta espacios o barra final.
- `.nojekyll`: GitHub Pages sirve los archivos tal cual, sin pasarlos por Jekyll.

### 11.6 Documentación

- `LEEME_montaje.md` reescrito: paso de la v2 a la v3, montaje desde cero y cómo volver atrás.
- `GUIA_DEL_DIA.md`, nueva: ensayo, operación, «qué hacer si…» y qué funciones se pueden correr durante el evento.
- `MAPA_DEL_SISTEMA.md`, nuevo: recorrido de una respuesta, archivos, columnas, propiedades, acciones, parámetros, servicios y compatibilidad.
- `README.md` y `PLAN.md` al día. El `PLAN.md` trae una tabla para decidir qué publicar de la v3 según el tiempo que haya para ensayar.

### 11.7 Lo que no se pudo probar desde aquí

La red de este entorno no llega a `script.google.com`, a Gemini ni al CDN del QR. Por eso quedan para el ensayo de la mañana:

- el Apps Script real, publicado como versión nueva;
- que Gemini entienda el audio que graba cada teléfono: `probarTranscripcion()` con un Android y un iPhone;
- el formulario en Safari de iPhone;
- `pruebaRecepcion100()` contra la dirección real.

### 11.8 Hallazgos de la fase 2, al cierre de la noche

| Hallazgo | Estado |
| --- | --- |
| 13 bloqueo, 14 `build.py`, 15 fichas ilegibles, 16 envíos vacíos, 17 hora del teléfono, 18 nube, 19 clave incorrecta, 20 sigla, 21 documentación | Resueltos |
| 22 `--warn` | No era un problema |
| 12 texto legal y facturación | Sigue siendo una decisión de la Cámara |
