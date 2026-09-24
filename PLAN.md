# Plan para el evento — viernes 25 de septiembre de 2026

Estado al viernes 25 de madrugada. La v2 corre desde el martes. Durante la noche del jueves se preparó la **v3**: el mismo sistema, reforzado contra las fallas que podían aparecer en el evento. Está en la rama `claude/practical-hopper-brypwz`, probada con 66 pruebas automáticas, pero todavía **no está publicada ni ensayada con teléfonos reales**. Ver «Decisión de la mañana».

## Decisión de la mañana: qué publicar

Este plan tiene una regla: **el viernes no se estrena nada que no haya corrido antes con gente real.** La v3 se preparó de noche, así que la regla se cumple solo si se ensaya antes de abrir el formulario. Lo que se recomienda, según el tiempo que haya:

| Pieza | Riesgo de publicarla | Recomendación |
| --- | --- | --- |
| **Panel v3** (`panel/panel.html` o el prototipo armado de nuevo) | Bajo: corre solo en el portátil del operador y se ve antes de proyectar. Funciona con el backend v2 o v3 | Usarlo en cualquier caso |
| **Backend v3** (`Codigo.gs`) | Medio: se probó contra un simulador de Apps Script, no contra Google | Publicarlo si hay **45 minutos** para el ensayo corto de la [guía del día](GUIA_DEL_DIA.md), sección 1 |
| **Formulario v3** (`index.html`) | Medio: se probó en Chromium, no en Safari de iPhone | Igual: con el ensayo, en un Android y un iPhone |

Si el ensayo muestra cualquier problema, **se vuelve atrás en dos minutos** (ver [LEEME_montaje.md](LEEME_montaje.md), «Volver atrás») y el evento corre con la v2 y el panel v3. Las piezas viejas y las nuevas funcionan juntas en cualquier combinación.

## Lo que ya funciona

**Capacidad.** El motor se reescribió el martes y se probó con **200 respuestas simuladas** — 408 voces, contando visión y compromiso por separado. Resultado: **408 de 408 clasificadas, ninguna fallida, en menos de tres minutos**. La meta era cinco.

Los tres cambios que lo lograron:

| Cambio | Qué se hizo | Qué ganó |
| --- | --- | --- |
| Sin candado en la recepción | El envío no toca la hoja: guarda audio y ficha en Drive y responde de una. El proceso de cada minuto arma las filas en bloque. | Los 200 envíos dejan de hacer fila. El envío de prueba respondió en 2,5 segundos |
| Llamadas en paralelo | `UrlFetchApp.fetchAll`, hasta 25 transcripciones a la vez | 400 transcripciones de 25 minutos a unos 3 |
| Dos etapas con su clave cada una | Etapa 1 audio → texto. Etapa 2 texto → palanca, sector, resumen y palabras, **de a 20 en una sola llamada** | Las 400 llamadas de clasificación se vuelven 20 |

> Los límites de Gemini se aplican **por proyecto, no por clave**. Las dos claves salen de dos proyectos distintos de Google Cloud. Ver <https://ai.google.dev/gemini-api/docs/rate-limits>.

**Nube de palabras.** Reemplazó al árbol que se había pensado al principio. Cada respuesta devuelve de una a tres palabras de impacto en la misma llamada de clasificación, sin sumar tiempo ni costo. En pantalla, el tamaño de cada palabra depende de cuánta gente la dijo y el color de su familia de palanca.

Decisiones tomadas sobre la nube:

- **Vocabulario mixto.** Un núcleo curado de 30 palabras sacadas del PND y de las nueve palancas, más cualquier palabra de fuera **que tres o más personas repitan**. Así la nube se puede sorprender sola sin llenarse de ruido. Las palabras de fuera se pintan en gris, para distinguir lo que trajo la sala de lo que estaba previsto.
- **Sin palabras vacías.** A la IA se le piden sustantivos de contenido, y el panel filtra además artículos, preposiciones y todo lo de menos de cuatro letras.
- **Logos al tocar la palabra.** La nube se mantiene limpia; al tocar una palabra, aparecen abajo las organizaciones que la dijeron. Mientras no haya catálogo de logos, cada una sale con un escudo de iniciales.
- **Dos secciones, no cinco.** La vista muestra *Nube de palabras* o *Palancas y voces*, una a la vez. Al proyectar se esconde el texto explicativo y la pieza ocupa la pantalla.

**Clasificación por palancas.** Se rehízo con el *Resumen ejecutivo PND Cartagena–Bolívar v6* como fuente. Cada palanca lleva ahora su definición larga y un **mapa de términos** sacado del documento —el aeropuerto y Bayunca en conectividad, el régimen de la Costa Caribe en energía, el Canal del Dique y María la Baja en agua, la formalización progresiva y la Ventanilla Única en reglas—. Encima van nueve **reglas de desempate** para las confusiones que aparecían en las pruebas:

- Un **sector** no es una palanca. «Turismo», «puerto», «industria» nombran desde dónde habla la persona; la palanca es la condición que pide mover.
- **Puerto**: dragado, canal y corredor de carga son conectividad; aduana y trámites son reglas.
- **Agua vs. clima**: acueducto, riego y Canal del Dique son agua; erosión costera y adaptación son clima.
- **Energía vs. clima**: renovables, gas y tarifas son energía; solo es clima cuando el punto son las emisiones o los ecosistemas.
- **Informalidad**: de empresas es reglas; de personas y sus ingresos es brechas.
- **Empleo**: generarlo y cerrar brechas de ingreso es brechas; formar para él es formación.
- **Plata**: crédito y garantías para producir es crédito; presupuesto, regalías y vigencias futuras es instituciones.

Van también ocho ejemplos resueltos y una **pista determinista**: antes de llamar a la IA, el script cuenta cuántos términos de cada palanca aparecen en la respuesta y le pasa las tres primeras como señal de apoyo —no como respuesta—. Probada contra doce casos de control, la pista acierta la palanca en once; el doceavo es una frase deliberadamente vaga («que Cartagena sea potencia turística») y devuelve «sin señal», que es lo correcto: ahí decide la IA y marca confianza baja.

**Formulario.** Tres cambios:

- **Todos los campos son obligatorios**, cargo incluido. El botón de enviar queda apagado y arriba se lista lo que falta, que se va tachando solo. Así no entra una voz sin organización o sin compromiso.
- **Una sola respuesta por teléfono.** Al enviar, el teléfono guarda una marca; si la persona vuelve a abrir el enlace, ve «ya recibimos su respuesta». Se quitó el botón de «Enviar otra respuesta». Es un freno, no una garantía: se salta con una ventana de incógnito u otro teléfono, y sirve para los reenvíos por error, que son la mayoría en un evento presencial. Para los duplicados que se cuelen, la hoja se revisa por nombre + organización y se usa la casilla `ocultar`.
- **Autocompletado de organización** con las 60 invitadas, que es lo que hace que «CCC», «la Cámara» y «Cámara de Comercio de Cartagena» sean una sola organización en el panel y no tres.

**Paleta e identidad.** El panel usa la paleta de la Cámara —marino, petróleo, naranja, ámbar y crema—, aplicada solo a la vista «La voz de la Junta» y al modo proyección. Las tres familias de palancas toman tres colores distintos: territorio petróleo, empresas naranja, gente ámbar.

**Las 60 organizaciones.** Están en el panel con su nombre oficial, su sigla y las otras formas en que la gente las escribe, para que «CCC», «la Cámara» y «Cámara de Comercio de Cartagena» sean una sola y no tres.

**Los logos: 52 de 60.** Se buscó organización por organización, primero el sitio propio y después —cuando no había— el sitio del gremio que la agrupa o de la red a la que pertenece. Esa segunda vía fue la que destrabó la mayoría: el Consejo Gremial de Bolívar publica una ficha con logo de cada asociado, Redprodepaz un directorio de sus programas, la UTB la página del CUEE. Cada logo se revisó a ojo en una hoja de contactos antes de entrar al panel. Las ocho restantes salen con su escudo de sigla.

Vale la pena dejar escrito por qué no se pudo automatizar del todo. Bajar el logo del sitio con un raspado simple acierta más o menos la mitad de las veces, y los errores son justo los peligrosos: a la Alcaldía le ponía el logo de GOV.CO, a la Cámara Marítima el de la ANDI, a CAMACOL dos sellos ISO y a Tenaris una foto de la planta. Por eso el paso de revisión a ojo no es opcional: **un logo equivocado proyectado delante del gerente de esa empresa es peor que no tener logo.** Los ocho que faltan están listados en `LOGOS_de_donde_salieron.md` con la razón de cada uno. Cuatro de ellos no son un problema de búsqueda: Congresistas de Bolívar es una bancada, no una entidad con marca; el CTP y la Comisión Regional de Competitividad no tienen identidad visual propia; y «Cámara Marítima Colombiana» no existe con ese nombre exacto.

Los logos viven en `panel/logos.js`, con el nombre oficial como clave y una marca `o:1` para los que son claros y necesitan fondo oscuro.

**La vista.** Abre con el mismo héroe del inicio —la foto de Cartagena— pero con el velo en marino y petróleo de la Cámara. Debajo van tres indicadores: las voces recibidas; las organizaciones que hablaron, que al tocarlas despliegan la lista con su logo y cuántas voces aportó cada una; y un tercero que sigue al filtro, mostrando visiones y compromisos juntos en «Todo» y solo uno de los dos al elegirlo.

**Habeas data.** Resuelto, y por la vía simple: el ejercicio se declara **público**. Se decidió así porque lo que se recoge no es sensible —nombre, organización, cargo y una respuesta— y porque el propósito mismo del ejercicio es que esas voces se vean: se proyectan en la sala y entran en los documentos de incidencia. Pedir cédula o correo habría agrandado el problema sin agregar nada.

El formulario lo dice en la casilla de autorización: nombre, organización y respuesta son públicos. **Cambio del 24 de septiembre:** se quitaron del formulario el recuadro «Esto es un ejercicio público…» y el texto completo desplegable de la autorización; queda solo la casilla. Lo que se dice abajo sobre la nota de voz y la revocatoria estaba en ese texto completo y ya no se muestra en el formulario.

Dos puntos que valía la pena cubrir y quedaron cubiertos:

- **La nota de voz.** Una grabación puede considerarse dato biométrico si se usa para identificar a alguien por su voz. Aquí no: se transcribe y se trabaja sobre el texto. El documento lo dice expresamente —no hay reconocimiento de voz ni tratamiento biométrico—, que es lo que mantiene la grabación fuera de la categoría de dato sensible.
- **La revocatoria.** Se puede pedir en cualquier momento, pero el texto aclara que lo ya proyectado o ya publicado no se puede deshacer. Prometer lo contrario habría sido prometer algo imposible de cumplir.

Los datos del responsable —dirección, teléfono, canal de PQRSD, enlace a la política— salen de la página oficial de la Cámara y viven en un solo bloque del formulario, así que se corrigen en un lugar. **El texto no lo redactó un abogado:** conviene que la oficina jurídica lo revise antes del viernes, pero no bloquea.

**Árbol de logos.** Pedido nuevo: un tablero con los logos de las organizaciones que hablaron, la Cámara arriba y más grande, y las demás debajo por número de voces, proyectable en una ventana aparte. Ya está en el panel, como tercer botón al lado de «Palancas y voces», con las tres formas seleccionables —pirámide, ramificado y burbujas— y su botón para proyectarlo en una ventana aparte. Se dejaron las tres porque cuál se ve mejor depende de cuántas organizaciones hablen, y eso solo se sabrá en el ensayo. `Arbol_de_logos_prototipo.html` queda como banco de pruebas con datos inventados.

Dos decisiones ya tomadas en el prototipo: el tamaño crece con la **raíz** del número de voces, no con el número directo, porque si no una organización con catorce voces quedaría catorce veces más grande que una con una y el tablero se desbalancearía; y cada logo va sobre una chapa blanca, o marino cuando el logo es claro, porque los logos con fondo transparente desaparecen si no.

## Lo que falta

| Qué | Quién | Por qué bloquea |
| --- | --- | --- |
| Decidir qué se publica de la v3 | Yolvis | Ver «Decisión de la mañana» |
| Ensayo con teléfonos reales | Equipo | Es lo único del camino que no se ha probado de punta a punta: grabar desde un celular (Android y iPhone), en el sitio, con el wifi del sitio. `probarTranscripcion()` confirma que Gemini entiende el audio de cada teléfono |
| Facturación en el proyecto de la clave 1 | Yolvis | Sin ella, el nivel gratuito limita las transcripciones por minuto y Google puede usar los audios. El texto de autorización dice que los datos no se entregan a terceros |
| Elegir la forma del árbol en el ensayo | Yolvis | Las tres están disponibles en el panel; con pocas organizaciones el ramificado se ve mejor que la pirámide |
| Los 8 logos que faltan | Yolvis | Opcional. Esas organizaciones salen con su escudo de sigla, que ya se ve bien |
| Subir los logos al repositorio | — | Después del ensayo. `logos.js` pesa 200 KB y subirlo por el editor web toma varios envíos por partes |
| Congelar el código | — | Después del ensayo de la mañana |

## Correcciones de la auditoría del jueves 24

Antes de congelar se corrigió lo que podía fallar en pleno evento:

- **El formulario ya no da por enviada una respuesta que no llegó.** Solo cuenta como enviada si el servidor responde que la recibió; si responde otra cosa o no responde en 90 segundos, queda en el teléfono y se reintenta sola cada 10 a 20 segundos, al azar, para que los teléfonos no vuelvan a llegar todos juntos.
- **Un 503 ya no gasta intentos**, como decía este plan pero el código no hacía. Si Gemini se satura, la etapa espera al minuto siguiente en vez de insistir en bucle. Solo si una misma respuesta lleva diez minutos seguidos fallando así se cuenta un intento.
- **Una respuesta de la IA que no se puede leer** cuenta un intento y se reintenta al minuto siguiente; antes repetía la misma llamada durante cuatro minutos sin avanzar.
- **Un audio borrado o dañado** afecta solo a su respuesta; antes detenía todo el proceso.
- **Cada resultado se escribe buscando la fila por su id**, no por su posición, y el proceso usa un candado real. `borrarPruebas()` y `reintentarErrores()` esperan a que termine el proceso de cada minuto.
- **Un nombre que empiece por `=`** ya no se vuelve fórmula en la hoja.
- **Logos:** una organización se reconoce solo si el nombre coincide sin duda. «Cámara de Comercio de Bogotá» ya no sale con el logo de la de Cartagena, ni «Gobernación del Atlántico» con el de la de Bolívar. Si hay duda, sale el escudo de iniciales.
- **Árbol de logos:** la ventana aparte se actualiza con cada refresco y sigue la forma elegida en el panel. En «Burbujas», las burbujas se achican hasta que quepan todas; antes, con 30 organizaciones de igual tamaño, solo cabían 11 y el resto desaparecía sin aviso.
- **El muro de voces** ya no parpadea cada 20 segundos: solo entra con animación la tarjeta nueva.

`pruebaCarga200()` no pasaba por la recepción. Para eso está `pruebaRecepcion100()`, que se corre en el ensayo.

## Versión 3 (madrugada del viernes)

Sobre las correcciones del jueves, la v3 cubre lo que todavía podía parar el sistema en pleno evento. El detalle está en `AUDITORIA_24sep.md`, paso 11.

- **El tope diario de Google.** En una cuenta personal, los disparadores tienen 90 minutos de ejecución al día. Un disparador que corre cada minuto y lee la hoja cada vez podía agotarlo. Ahora, sin trabajo, sale en milisegundos sin tocar Drive ni la hoja.
- **Motor de respaldo.** Si el disparador se detiene por cualquier razón, el panel lo nota («el disparador no está corriendo») y pide el proceso él mismo. Tiene botones **Procesar ahora** y **Reintentar errores**.
- **Tope de 6 minutos.** Ninguna ejecución empieza una llamada a Gemini que pueda pasarse del límite.
- **Una respuesta problemática no frena a las demás.** Si la IA no puede con una tanda de 20, se reparte de a una.
- **La cola del teléfono** está en IndexedDB: en iPhone, dos notas de voz no cabían en el almacenamiento anterior, y cerrar la página las perdía.
- **Modo ensayo** (`?ensayo=1`): respuestas marcadas como prueba que no bloquean el teléfono. La marca de «ya respondió» vale por ronda: los teléfonos del ensayo pueden responder el día del evento.
- **Panel independiente** (`panel/panel.html`): funciona sin el prototipo.
- **Operación**: `diagnostico()`, `archivarEnsayo()`, `probarTranscripcion()`, `revisarDuplicados()`, `procesarAhora()`, `activarMotor()` y `pausarMotor()`.

## Protocolo del día

La versión completa, con la tabla de «qué hacer si…», está en la [guía del día](GUIA_DEL_DIA.md).

| Cuándo | Qué |
| --- | --- |
| Al pegar el código nuevo | Publicar una **nueva versión** en la misma implementación (*Gestionar implementaciones → editar*) para que la dirección `/exec` no cambie |
| En el ensayo | `diagnostico()`, `verificarClaves()`; formulario con `?ensayo=1` desde un Android y un iPhone; `probarTranscripcion()` después de cada uno; `pruebaRecepcion100()` y mirar cuántas entraron bien; después `borrarPruebas()` |
| Antes de abrir el formulario | `borrarPruebas()`, o `archivarEnsayo()` si quedaron respuestas sin marca de prueba; `diagnostico()` |
| Durante el evento | **No ordenar ni borrar filas** en la hoja. Para mirar por organización o palanca, usar *Datos → Vistas de filtro*, que no mueven las filas. Corregir solo `*_palanca_validada`, `ocultar`, `estado` y `notas_equipo` |
| Si una fila queda en error | `reintentarErrores()` |

## Riesgos y plan B

| Riesgo | Plan B |
| --- | --- |
| El wifi del sitio no aguanta 200 celulares subiendo audio | El formulario guarda en el teléfono antes de enviar y reintenta solo, con más tiempo de espera según el tamaño del audio; si falla, invitar a responder escribiendo o con datos móviles |
| Gemini se satura | Cuatro modelos de respaldo por etapa; un 503 no gasta intentos y la fila vuelve a la cola |
| El disparador de cada minuto se detiene (tope diario, error de Google) | El panel lo detecta y procesa como respaldo; `activarMotor()` lo recrea |
| Gemini no entiende el audio de algún teléfono | Se detecta en el ensayo con `probarTranscripcion()`. Si pasa en el evento, la persona puede escribir, y el equipo ubica a mano con `*_palanca_validada` |
| GitHub Pages o Apps Script caen | Los teléfonos guardan y reenvían solos. Plan B: el formulario de Jotform de la primera versión (ver la guía del día) |
| El portátil del panel se reinicia o pierde internet | `panel.html` arranca con los últimos datos guardados y se pone al día solo al volver la conexión |
| La IA ubica mal una palanca | La columna `*_palanca_validada` manda sobre la de la IA; se corrige en la hoja y el panel se actualiza en 20 segundos |
| Una palabra sobra en la nube | Se corrige en la hoja y desaparece de la pantalla en el siguiente refresco |
| Alguien manda dos respuestas saltándose el freno | Se detecta en la hoja por nombre + organización y se oculta con la casilla `ocultar` |
| Alguien graba algo inapropiado | La casilla `ocultar` saca esa voz del panel al instante, sin borrarla |

**El viernes no se estrena nada.** Todo lo que se proyecte tiene que haber corrido el jueves, con gente real y en el sitio.

## Pendientes después del evento

- Mover la hoja, los audios y el script de una cuenta personal a una cuenta institucional de la Cámara.
- Compartir la carpeta de audios con el Departamento de Investigaciones Económicas.
- Activar la facturación en **los dos** proyectos de Google Cloud, no en uno.
