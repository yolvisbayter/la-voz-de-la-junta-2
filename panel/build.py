# Arma el panel de «La voz de la Junta».
#
#   python3 build.py
#
# Genera siempre:
#   panel.html  el panel independiente: funciona solo, sin el prototipo. Es el plan B.
# Y, si en esta carpeta está el prototipo como original.html:
#   Sistema_inteligencia_territorial_prototipo_v2.html  la vista dentro del prototipo.
#
# Si algo no calza (el prototipo cambió y no están los puntos donde se inserta la vista),
# se detiene con un mensaje claro en vez de generar un archivo roto.
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))


def leer(nombre):
    with open(os.path.join(AQUI, nombre), encoding='utf-8') as f:
        return f.read()


def escribir(nombre, texto):
    with open(os.path.join(AQUI, nombre), 'w', encoding='utf-8') as f:
        f.write(texto)


def parar(msg):
    print('ERROR: ' + msg)
    sys.exit(1)


css = leer('voz.css')
html = leer('voz.html')
logos = leer('logos.js')
voz = leer('voz.js')
js = logos + '\n' + voz

# Lo que va dentro de un <script> no puede cerrar la etiqueta antes de tiempo.
if re.search(r'</script', js, re.I):
    parar('voz.js o logos.js contienen "</script": el panel se cortaría ahí.')
if re.search(r'</style', css, re.I):
    parar('voz.css contiene "</style".')
if 'id="v-voz"' not in html:
    parar('voz.html no tiene la sección id="v-voz".')
if 'const LOGOS=' not in logos:
    parar('logos.js no define LOGOS.')

# ---------- 1. Panel independiente ----------
plantilla = leer('plantilla_independiente.html')
for marca in ('/*__VOZ_CSS__*/', '<!--__VOZ_HTML__-->', '/*__VOZ_JS__*/'):
    if plantilla.count(marca) != 1:
        parar('plantilla_independiente.html debe tener una sola vez la marca ' + marca)
solo = (plantilla.replace('/*__VOZ_CSS__*/', css)
        .replace('<!--__VOZ_HTML__-->', html)
        .replace('/*__VOZ_JS__*/', js))
escribir('panel.html', solo)
print('listo: panel.html (independiente, %d KB)' % (len(solo.encode('utf-8')) // 1024))

# ---------- 2. Dentro del prototipo, si está ----------
if not os.path.exists(os.path.join(AQUI, 'original.html')):
    print('(no hay original.html: se generó solo el panel independiente)')
    sys.exit(0)

s = leer('original.html')
if 'id="v-voz"' in s:
    parar('original.html ya trae la vista de la voz: use el prototipo SIN la vista, no un panel ya armado.')
faltan = [m for m in ('<span class="vista">', '</style></head>', '</main>', '</script>') if m not in s]
if faltan:
    parar('original.html no tiene ' + ', '.join(faltan) + '. El prototipo cambió; revise dónde insertar la vista.')

nav = ('<button class="nv" data-v="voz"><svg viewBox="0 0 24 24">'
       '<rect x="9" y="3" width="6" height="11" rx="3"/>'
       '<path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
       'La voz de la Junta<span class="vivo" aria-hidden="true"></span></button>\n  <span class="vista">')
s = s.replace('<span class="vista">', nav, 1)
i = s.rfind('</style></head>')
s = s[:i] + css + s[i:]
s = s.replace('</main>', html + '</main>', 1)

# El código va al final del último <script> del prototipo (así se probó). Si ese último
# script carga un archivo externo (src=), el navegador ignoraría lo de adentro: en ese
# caso va en un <script> propio antes de </body>.
i = s.rfind('</script>')
apertura = s.rfind('<script', 0, i)
etiqueta = s[apertura:s.find('>', apertura) + 1]
if re.search(r'\bsrc\s*=', etiqueta, re.I):
    if '</body>' not in s:
        parar('el último <script> del prototipo es externo y no hay </body> donde agregar la vista.')
    j = s.rfind('</body>')
    s = s[:j] + '<script>\n' + js + '\n</script>\n' + s[j:]
    print('aviso: el último <script> del prototipo es externo; la vista va en un <script> propio.')
else:
    s = s[:i] + js + s[i:]

salida = 'Sistema_inteligencia_territorial_prototipo_v2.html'
escribir(salida, s)
print('listo: ' + salida + ' (%d KB)' % (len(s.encode('utf-8')) // 1024))
