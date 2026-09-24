# Montaje de La voz de la Junta

Dos caminos:

- **A. Ya está montado (la v2 corre desde el martes): pasar a la v3.** Es lo que hay que hacer el viernes por la mañana. Unos 20 minutos.
- **B. Montar desde cero** en una cuenta nueva (por ejemplo, la institucional de la Cámara, después del evento). Unos 40 minutos.

Las piezas nuevas y las viejas funcionan juntas. El formulario viejo habla bien con el backend nuevo y el formulario nuevo habla bien con el backend viejo. Si una parte no alcanza a actualizarse, lo demás sigue funcionando.

---

## A. Pasar de la v2 a la v3 (viernes por la mañana)

### 1. Backend (Apps Script)

1. Abra el proyecto de Apps Script y el archivo `Codigo.gs`.
2. **Copie el valor de `SHEET_ID`** de la línea `const SHEET_ID = '...';` y guárdelo a mano. El archivo nuevo trae un marcador en su lugar.
3. Borre todo el contenido de `Codigo.gs` y pegue el de `apps_script/Codigo.gs` de este repositorio.
4. Vuelva a poner el ID de la hoja en `SHEET_ID`. Guarde (Ctrl+S).
5. Ejecute **`configurar()`** (menú de funciones, arriba, y ▶ Ejecutar). Se puede correr las veces que haga falta:
   - agrega al final de la hoja la columna nueva `enviado`, sin mover las demás;
   - conserva la clave del panel, las carpetas y las propiedades;
   - deja un solo disparador de cada minuto.

   Si pide autorizar permisos, acéptelos. Son los mismos de antes.
6. **Publique la versión nueva**, sin crear una implementación nueva: *Implementar → Gestionar implementaciones → lápiz (editar) → Versión: Nueva versión → Implementar*. La dirección `/exec` no cambia.

   > Si solo guarda y no publica, el formulario y el panel siguen hablando con el código viejo.
7. En *Configuración del proyecto → Propiedades del script*, agregue `URL_EXEC` con la dirección que termina en `/exec`. La usa `pruebaRecepcion100()`.
8. Ejecute **`diagnostico()`** y lea el registro de ejecución. Cada línea dice `OK` o `REVISAR`. Todo debe quedar en `OK`, menos quizás el latido del disparador, que aparece un minuto después.
9. Ejecute **`verificarClaves()`**. Las dos claves deben decir `FUNCIONA`.

### 2. Formulario (GitHub Pages)

1. Lleve los cambios a la rama que publica GitHub Pages, normalmente `main`: se une la rama `claude/practical-hopper-brypwz`, con un *pull request* o desde la terminal.
2. Espere uno o dos minutos y abra la dirección pública **con `?ensayo=1` al final**. Si arriba aparece el recuadro amarillo «Modo ensayo», el formulario nuevo ya está publicado.

### 3. Panel

El panel sale de dos maneras:

- **`panel/panel.html`**, el panel independiente. Ya viene armado en el repositorio y no necesita el prototipo. Es el plan B seguro.
- **La vista dentro del prototipo**: ponga el prototipo como `panel/original.html` y ejecute `python3 panel/build.py`. Genera `panel/Sistema_inteligencia_territorial_prototipo_v2.html`.

Cualquiera de los dos se abre así:

```
panel.html?fuente=<dirección /exec>&clave=<clave del panel>
```

La clave del panel está en el registro de `configurar()` y en *Propiedades del script → `PANEL_TOKEN`*. Con el prototipo, agregue `&vista=voz` para que abra directo en la vista.

Opciones útiles de la dirección:

| Parámetro | Qué hace |
| --- | --- |
| `&proyectar=1` | Abre en modo proyección. La pantalla completa se activa con un clic o con la tecla P |
| `&seccion=nube`, `analisis` o `arbol` | Sección con la que abre |
| `&forma=piramide`, `ramas` o `burbujas` | Forma del árbol de logos |
| `&rotar=30` | En proyección, cambia de sección cada 30 segundos |
| `&refresco=20` | Cada cuántos segundos pide datos nuevos (de 3 a 300) |

Atajos de teclado en el panel: **1** nube · **2** palancas y voces · **3** árbol · **P** proyección · **R** rotar.

### 4. Ensayo con teléfonos reales

Siga la [guía del día](GUIA_DEL_DIA.md), sección «Ensayo».

### Volver atrás (si el ensayo muestra un problema)

Toma dos minutos y no se pierde ninguna respuesta:

- **Backend**: *Implementar → Gestionar implementaciones → lápiz → Versión*: escoja la versión anterior → *Implementar*. La dirección `/exec` sigue igual. La columna `enviado` que se agregó a la hoja no molesta a la v2.
- **Formulario**: en GitHub, revierta la unión de la rama. En *Pull requests*, el botón *Revert* del que se unió. GitHub Pages vuelve a la versión anterior en uno o dos minutos. Única salvedad: si en ese momento algún teléfono tiene una respuesta todavía sin enviar, el formulario viejo no la ve, y queda guardada en ese teléfono hasta que se vuelva a publicar la v3.
- **Panel**: abra el panel anterior. El panel v3 también funciona con el backend v2.

---

## B. Montar desde cero

### 1. Claves de Gemini: dos proyectos distintos

1. En [aistudio.google.com](https://aistudio.google.com), cree **dos proyectos de Google Cloud** y una clave en cada uno (*Get API key*).
2. Los límites de Gemini se aplican **por proyecto, no por clave**: dos claves del mismo proyecto comparten cupo y no sirven de nada. Ver <https://ai.google.dev/gemini-api/docs/rate-limits>.
3. **Active la facturación en los dos proyectos.** En el nivel gratuito, Google puede usar los audios y los textos para mejorar sus productos, y los límites por minuto son bajos.

### 2. Hoja y Apps Script

1. Cree una hoja de cálculo en Google Sheets y copie su ID: es lo que va entre `/d/` y `/edit` en la dirección.
2. En [script.google.com](https://script.google.com), cree un proyecto nuevo y pegue `apps_script/Codigo.gs`. Ponga el ID en `SHEET_ID` y guarde.
3. *Configuración del proyecto*: zona horaria `America/Bogota`. Si quiere, active «Mostrar el archivo de manifiesto» y pegue `apps_script/appsscript.json`.
4. *Configuración del proyecto → Propiedades del script*: agregue `GEMINI_API_KEY` (clave del proyecto 1, transcripción) y `GEMINI_API_KEY_2` (clave del proyecto 2, clasificación).
5. Ejecute **`configurar()`** y autorice los permisos. Crea:
   - la hoja `Voces`;
   - las carpetas de audios y de bandeja en Drive;
   - la clave del panel;
   - el disparador de cada minuto.
6. *Implementar → Nueva implementación → Aplicación web*, con **Ejecutar como: Yo** y **Quién tiene acceso: Cualquier usuario**. Copie la dirección que termina en `/exec`.
7. Agregue la propiedad `URL_EXEC` con esa dirección.
8. Ejecute `diagnostico()` y `verificarClaves()`.

### 3. Formulario

1. En `index.html`, bloque `CONFIG`:
   - `url`: la dirección `/exec`.
   - `entidad`: el nombre que aparece en la casilla de autorización.
   - `ronda`: un nombre por evento, por ejemplo `junta-2026-09-25`. La marca de «ya respondió» vale por ronda, así que para un evento nuevo basta cambiarla.
2. Publique con GitHub Pages: *Settings → Pages → Deploy from a branch*. El micrófono necesita https, y GitHub Pages lo da.

### 4. Panel y cartel

1. Panel: vea la sección A.3.
2. Cartel: abra `carteles_qr.html`, pegue la dirección pública del formulario, pruebe el enlace desde un celular e imprima en A4 sin márgenes.

---

## Si algo no sale

- `diagnostico()` dice qué falta y cómo arreglarlo.
- La [guía del día](GUIA_DEL_DIA.md) tiene la tabla de «qué hacer si…».
- El [mapa del sistema](MAPA_DEL_SISTEMA.md) explica cada pieza, cada columna de la hoja y cada propiedad.
