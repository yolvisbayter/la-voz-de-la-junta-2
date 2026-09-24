# Guía del día — Junta de Juntas, viernes 25 de septiembre de 2026

Para las dos personas que operan el sistema:

- **Operador de pantalla**: el portátil conectado al proyector, con el panel abierto.
- **Operador de hoja**: otro equipo, con la hoja `Voces` y el editor de Apps Script abiertos.

---

## 1. Ensayo (antes de abrir el formulario al público)

Con la v3 ya publicada (ver [LEEME_montaje.md](LEEME_montaje.md), sección A):

1. **Operador de hoja**: `diagnostico()` → todo en `OK`.
2. **Operador de hoja**: `verificarClaves()` → las dos claves `FUNCIONA`.
3. **Dos personas del equipo**, una con Android y otra con iPhone, abren el formulario con **`?ensayo=1`** al final de la dirección:
   - graban la visión con la voz y escriben el compromiso;
   - envían.

   El recuadro amarillo «Modo ensayo» confirma que es el formulario nuevo. Las respuestas de ensayo llevan una marca y no bloquean el teléfono.
4. **Operador de hoja**: después de cada envío con audio, `probarTranscripcion()`. Debe mostrar lo que se dijo. **Si falla con uno de los dos teléfonos, avise antes de seguir**: es la única parte que no se ha podido probar sin los teléfonos reales.
5. **Operador de pantalla**: abre el panel con la fuente y la clave. En uno o dos minutos las voces de ensayo aparecen ubicadas. La barra de arriba (solo la ve el operador) dice «motor: latido hace … s».
6. **Operador de hoja**: `pruebaRecepcion100()` → «Recibidas bien: 100 de 100».
   - Si entran menos, no es grave: el formulario reintenta solo cada 10 a 20 segundos.
   - Anote el número: da una idea de cuántas personas pueden enviar en el mismo segundo.
7. **Probar el wifi del sitio**: desde un celular conectado al wifi del evento, enviar una respuesta de ensayo con audio.

### Limpiar antes de abrir

- **`borrarPruebas()`** borra lo que tenga marca de prueba: `?ensayo=1`, `pruebaRecepcion100`, `pruebaCarga200`.
- Si en la hoja quedó algo **sin** marca de prueba (alguien del equipo respondió sin `?ensayo=1`), use **`archivarEnsayo()`**. Copia todo a una pestaña «Ensayo …» y deja `Voces` vacía.

  > **Nunca durante el evento**: el panel quedaría en cero.
- `diagnostico()` una última vez.

---

## 2. Durante el evento

### Operador de pantalla

- Abrir el panel con `&proyectar=1` o pulsar **P**, y hacer un clic para la pantalla completa. La pantalla no se apaga sola, pero igual conviene poner el portátil en «no suspender» y conectado a la corriente.
- Atajos: **1** nube · **2** palancas y voces · **3** árbol · **P** proyección · **R** rotar sección cada 30 s.
- Para ver la barra del operador, salir de la proyección (**P**). La sala no la ve.
- Árbol de logos en otra ventana: botón «Proyectar en otra ventana», dentro de la sección del árbol. Esa ventana se actualiza sola. Si se recarga el panel, hay que volver a abrirla con el botón.

### Operador de hoja

- **Corregir una palanca**: escoger la correcta en `vision_palanca_validada` o `compromiso_palanca_validada`. El panel la toma en el siguiente refresco (unos 20 s).
- **Sacar una voz de la pantalla**: marcar `ocultar`. No se borra nada.
- **Duplicados**: `revisarDuplicados()` lista las filas con el mismo nombre y organización; se oculta la que sobre.
- **No ordenar ni borrar filas.** Para mirar por organización o palanca: *Datos → Vistas de filtro*, que no mueven nada.
- Columnas para el equipo: `*_palanca_validada`, `ocultar`, `estado`, `notas_equipo`. Las demás las escribe el sistema.

---

## 3. Qué hacer si…

| Se ve | Qué pasa | Qué hacer |
| --- | --- | --- |
| Barra del operador en rojo: «el disparador no está corriendo» | El disparador de cada minuto se detuvo; por ejemplo, se agotó el tope diario de Google | Nada urgente: **el panel procesa como respaldo** mientras esté abierto. Luego `diagnostico()` y `activarMotor()`. Si el tope diario se agotó, el respaldo del panel o `procesarAhora()` siguen funcionando |
| «N en cola» crece y no baja; última falla 429 o 503 | Gemini saturado o fuera de cupo (nivel gratuito) | Esperar: reintenta solo cada minuto y la saturación no gasta intentos. Solución de fondo: facturación activa en los dos proyectos |
| Última falla 400 «API key not valid» | Clave mal puesta o borrada | `verificarClaves()`; corregir la propiedad `GEMINI_API_KEY` o `GEMINI_API_KEY_2` |
| Última falla con «respuesta vacía (SAFETY)» | La IA no quiso procesar una respuesta | Solo afecta a esa respuesta. Si queda en error, ubicarla a mano con `*_palanca_validada` |
| «N con error» | Filas que fallaron 8 veces por un motivo real | Botón **Reintentar errores** o `reintentarErrores()`. Si vuelven a fallar, ubicarlas a mano |
| Panel: «Sin conexión · mostrando lo último» | El portátil perdió internet o Google no responde | El panel sigue mostrando los últimos datos. Revisar el wifi. Al volver la conexión se actualiza solo |
| Panel: «Clave del panel incorrecta» | La `clave=` de la dirección no coincide | Copiar `PANEL_TOKEN` de *Propiedades del script* |
| Panel colgado o lento | El navegador | Recargar (F5). Arranca con los últimos datos guardados |
| Un asistente ve «La conexión está lenta» | Su teléfono no pudo enviar todavía | La respuesta está guardada en su teléfono y se envía sola. Pedirle que no cierre la página un momento; si el wifi falla, que use datos móviles |
| Un asistente no puede grabar | Permiso negado o navegador de otra app (WhatsApp, Instagram) | «Prefiero escribir», o abrir el enlace en Safari o Chrome |
| Un asistente ve «Ya recibimos una respuesta desde este teléfono» | Ya respondió desde ese teléfono | Es lo esperado. Si de verdad es otra persona con el mismo teléfono (un equipo compartido), el equipo abre el formulario con `?reiniciar=1` en ese teléfono |
| Una nota de voz sin palabras (silencio o ruido) | La transcripción la marca `(inaudible)` | Cuenta como recibida pero no sale en el muro. Si la persona escribió también, se usa lo escrito |
| Alguien dice algo inapropiado | — | Marcar `ocultar`. Sale de la pantalla en el siguiente refresco |
| La IA ubicó mal una voz | — | `*_palanca_validada` |
| Una ficha no se pudo leer | Llegó dañada | Queda en la carpeta «La voz de la Junta - cuarentena» de Drive, para revisarla a mano. No frena a las demás |
| El formulario no abre en ningún teléfono (GitHub Pages caído) | Falla de GitHub | Plan B: el formulario de Jotform de la primera versión, <https://form.jotform.com/262635579619068>. Las respuestas quedan en Jotform (*Mis formularios → La voz de la Junta → Tablas*) y se clasifican después; no llegan al panel |
| Apps Script no responde en absoluto | Falla de Google | Los teléfonos guardan las respuestas y las envían cuando vuelva. El panel muestra lo último. Si dura mucho, el plan B de Jotform |

### Funciones de Apps Script para el día

| Función | Para qué | ¿Se puede correr durante el evento? |
| --- | --- | --- |
| `diagnostico()` | Revisa todo y dice qué falta | Sí |
| `procesarAhora()` | Procesa ya, sin esperar el minuto | Sí |
| `reintentarErrores()` | Devuelve a la cola las filas en error | Sí |
| `revisarDuplicados()` | Lista personas que respondieron dos veces | Sí (solo informa) |
| `activarMotor()` / `pausarMotor()` | Crea o quita el disparador de cada minuto | Sí |
| `verificarClaves()` | Prueba las dos claves de Gemini | Sí |
| `probarTranscripcion()` | Transcribe la última nota de voz y muestra el resultado | Sí |
| `borrarPruebas()` | Borra filas y fichas con marca de prueba | Sí (solo toca las de prueba) |
| `pruebaRecepcion100()` / `pruebaCarga200()` | Pruebas de carga | **No**: llenan la cola con 100 o 200 respuestas falsas |
| `archivarEnsayo()` | Copia la hoja a otra pestaña y la deja vacía | **No**: el panel quedaría en cero |

---

## 4. Después del evento

1. `pausarMotor()`, para no gastar ejecuciones.
2. Revisar las filas con `estado` = «sin verificar» y las palancas validadas.
3. Pendientes del `PLAN.md`: mover la hoja, los audios y el script a una cuenta institucional; compartir la carpeta de audios con Investigaciones Económicas.
