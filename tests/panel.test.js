/**
 * Pruebas del panel (panel/panel.html, el independiente que arma build.py) en Chromium,
 * con un Apps Script simulado que responde por JSONP.
 * Correr:  node --test tests/*.test.js   (necesita Playwright; ver tests/correr_todo.sh)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const FUENTE = 'https://script.google.com/macros/s/PRUEBA_abc-123/exec';
let servidor, puerto, navegador;

test.before(async () => {
  execFileSync('python3', [path.join(RAIZ, 'panel', 'build.py')]);
  servidor = http.createServer((req, res) => {
    const f = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''));
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  puerto = servidor.address().port;
  const op = {};
  if (fs.existsSync('/opt/pw-browsers/chromium')) op.executablePath = '/opt/pw-browsers/chromium';
  navegador = await chromium.launch(op);
});
test.after(async () => { await navegador.close(); servidor.close(); });

const ahora = Date.now();
const voz = (o) => Object.assign({ id: 'id' + Math.random().toString(36).slice(2) + ':vision', momento: 1, nombre: 'Ana', organizacion: 'SIAB', texto: 'Riego para el campo', resumen: 'r',
  palanca: 'agua', palanca_2: '', sector: 'agro', palabras: ['agua', 'riego'], validada: false, confianza: 'alta', procesando: false, fallida: false, audio: true }, o || {});
const motorBien = (o) => Object.assign({ version: '3.0', ahora, latido: ahora - 20000, ultima: ahora - 20000, pendientes: 0, errores: 0, total: 3, hayFichas: false, fallo: null }, o || {});

/** Abre el panel. `servidor(params)` devuelve el objeto que contesta el Apps Script (o null = sin conexión). */
async function abrir(responde, opciones) {
  opciones = opciones || {};
  const ctx = opciones.ctx || await navegador.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: opciones.oscuro ? 'dark' : 'light' });
  const p = await ctx.newPage();
  const pedidos = [], errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.route('**/fonts.googleapis.com/**', r => r.abort());
  await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.route(/script\.google\.com\/macros/, async r => {
    const u = new URL(r.request().url());
    const params = Object.fromEntries(u.searchParams);
    pedidos.push(params);
    const obj = responde ? responde(params, pedidos) : null;
    if (obj === null) return r.abort();
    await r.fulfill({ status: 200, contentType: 'application/javascript', body: params.callback + '(' + JSON.stringify(obj) + ');' });
  });
  const q = opciones.query !== undefined ? opciones.query : '?fuente=' + encodeURIComponent(FUENTE) + '&clave=k&refresco=3' + (opciones.extra || '');
  await p.goto('http://localhost:' + puerto + '/panel/panel.html' + q);
  return { p, ctx, pedidos, errores };
}
const esperar = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 8000 });

test('modo demostración: se dibuja completo, sin errores, y los atajos funcionan', async () => {
  const { p, ctx, errores } = await abrir(null, { query: '' });
  await esperar(p, () => /Datos de prueba/.test(document.querySelector('#vzEstado').textContent));
  assert.equal(await p.isHidden('#vzOperador'), true);
  assert.ok(await p.locator('.vz-w').count() > 3, 'hay nube');
  await p.keyboard.press('2');
  assert.equal(await p.evaluate(() => document.querySelector('.vz-sec[data-sec="analisis"]').classList.contains('abierta')), true);
  await p.keyboard.press('3');
  assert.equal(await p.evaluate(() => document.querySelector('.vz-sec[data-sec="arbol"]').classList.contains('abierta')), true);
  await p.keyboard.press('p');
  assert.equal(await p.evaluate(() => document.body.classList.contains('proyectar')), true);
  await p.keyboard.press('p');
  assert.equal(await p.evaluate(() => document.body.classList.contains('proyectar')), false);
  assert.deepEqual(errores, []);
  await ctx.close();
});

test('en vivo: muestra las voces, el estado del motor y deja las fallidas fuera del muro', async () => {
  const voces = [
    voz({ nombre: 'Ana', organizacion: 'SIAB' }),
    voz({ nombre: 'Luis', organizacion: 'Cotelco', momento: 2, palanca: 'energia', palabras: ['energía'] }),
    voz({ nombre: 'Muda', organizacion: 'Agrem', palanca: '', fallida: true, texto: '' }),
    voz({ nombre: 'Nueva', organizacion: 'Fenalco', palanca: '', procesando: true, texto: '' })
  ];
  const { p, ctx, errores } = await abrir(() => ({ ok: true, voces, motor: motorBien() }));
  await esperar(p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  assert.match(await p.textContent('#vzOperador'), /latido hace 20 s · 0 en cola · 0 con error/);
  assert.equal(await p.textContent('.vz-kpis .k-marino .num'), '4');
  await p.keyboard.press('2');
  const muro = await p.textContent('#vzMuro');
  assert.doesNotMatch(muro, /Muda/);
  assert.match(muro, /Nueva/);
  assert.match(muro, /Transcribiendo/);
  assert.deepEqual(errores, []);
  await ctx.close();
});

test('la nube cuenta personas: quien dijo la palabra en visión y compromiso cuenta una vez', async () => {
  const voces = [
    voz({ nombre: 'Ana', palabras: ['agua'] }), voz({ nombre: 'Ana', momento: 2, palabras: ['agua'] }),
    voz({ nombre: 'Luis', organizacion: 'Cotelco', palabras: ['agua'] })
  ];
  const { p, ctx } = await abrir(() => ({ ok: true, voces, motor: motorBien() }));
  await esperar(p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  const n = await p.textContent('.vz-w[data-w="agua"] i');
  assert.equal(n, '2');
  await ctx.close();
});

test('clave incorrecta: lo dice claro', async () => {
  const { p, ctx } = await abrir(() => ({ ok: false, error: 'no autorizado' }));
  await esperar(p, () => /Clave del panel incorrecta/.test(document.querySelector('#vzEstado').textContent));
  assert.match(await p.textContent('#vzOperador'), /clave del panel no es la correcta/);
  await ctx.close();
});

test('motor de respaldo: si el disparador no late y hay trabajo, el panel pide el proceso', async () => {
  const quieto = motorBien({ latido: ahora - 10 * 60000, pendientes: 5 });
  const { p, ctx, pedidos } = await abrir(pr => pr.accion === 'procesar'
    ? { ok: true, resultado: { hecho: true }, motor: motorBien({ latido: ahora - 10 * 60000 }) }
    : { ok: true, voces: [voz()], motor: quieto });
  await esperar(p, () => /disparador no está corriendo/.test(document.querySelector('#vzOperador').textContent));
  await p.waitForTimeout(1500);
  assert.equal(pedidos.filter(x => x.accion === 'procesar').length, 1, 'un solo pedido de proceso');
  assert.equal(pedidos.find(x => x.accion === 'procesar').token, 'k');
  await ctx.close();
});

test('motor sano: el panel no pide procesos de más', async () => {
  const { p, ctx, pedidos } = await abrir(() => ({ ok: true, voces: [voz()], motor: motorBien({ pendientes: 3 }) }));
  await esperar(p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  await p.waitForTimeout(4000);
  assert.equal(pedidos.filter(x => x.accion === 'procesar').length, 0);
  await ctx.close();
});

test('botones del operador: procesar y reintentar', async () => {
  const { p, ctx, pedidos } = await abrir(pr => pr.accion === 'reintentar' ? { ok: true, devueltas: 2 }
    : pr.accion === 'procesar' ? { ok: true, resultado: { hecho: true }, motor: motorBien() }
    : { ok: true, voces: [voz()], motor: motorBien({ errores: 2 }) });
  await esperar(p, () => !!document.querySelector('#vzOpReintentar'));
  await p.click('#vzOpReintentar');
  await esperar(p, () => /2 filas devueltas/.test(document.querySelector('#vzOperador').textContent));
  assert.ok(pedidos.some(x => x.accion === 'reintentar'));
  assert.ok(pedidos.some(x => x.accion === 'procesar'), 'después de reintentar, pide el proceso');
  await ctx.close();
});

test('sin conexión al recargar: arranca con los últimos datos guardados', async () => {
  const ctx = await navegador.newContext();
  let arriba = true;
  const a = await abrir(() => arriba ? { ok: true, voces: [voz({ nombre: 'Guardada' })], motor: motorBien() } : null, { ctx });
  await esperar(a.p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  arriba = false;
  await a.p.reload();
  await esperar(a.p, () => /Sin conexión|guardado/.test(document.querySelector('#vzEstado').textContent));
  await a.p.keyboard.press('2');
  assert.match(await a.p.textContent('#vzMuro'), /Guardada/);
  await ctx.close();
});

test('sin cambios en los datos, no vuelve a dibujar (las tarjetas son las mismas)', async () => {
  const voces = [voz({ id: 'fijo:vision', nombre: 'Fija' })];
  const { p, ctx, pedidos } = await abrir(() => ({ ok: true, voces, motor: motorBien() }));
  await esperar(p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  await p.keyboard.press('2');
  await p.evaluate(() => { window.__tarjeta = document.querySelector('#vzMuro article'); });
  const antes = pedidos.length;
  await esperar(p, n => true, null, 100);
  await p.waitForTimeout(3500);
  assert.ok(pedidos.length > antes, 'sí volvió a pedir datos');
  assert.equal(await p.evaluate(() => document.querySelector('#vzMuro article') === window.__tarjeta), true);
  await ctx.close();
});

test('un nombre con HTML se muestra como texto', async () => {
  const voces = [voz({ nombre: '<img src=x onerror="window.__xss=1">', organizacion: '<b>Org</b>', texto: '<script>window.__xss=2</script>' })];
  const { p, ctx } = await abrir(() => ({ ok: true, voces, motor: motorBien() }));
  await esperar(p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  await p.keyboard.press('2');
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => window.__xss), undefined);
  assert.match(await p.textContent('#vzMuro'), /<img src=x/);
  await ctx.close();
});

test('respuesta de un Apps Script viejo (sin estado del motor): funciona y lo avisa', async () => {
  const { p, ctx, errores } = await abrir(() => ({ ok: true, voces: [voz()] }));
  await esperar(p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  assert.match(await p.textContent('#vzOperador'), /publique el Codigo\.gs v3/);
  assert.deepEqual(errores, []);
  await ctx.close();
});

test('parámetros: abre en el árbol con burbujas; con 60 organizaciones caben todas', async () => {
  const src = fs.readFileSync(path.join(RAIZ, 'panel', 'voz.js'), 'utf8');
  const orgs = [...src.matchAll(/^\["([^"]+)","[A-Z]+",\[/gm)].map(m => m[1]);
  assert.equal(orgs.length, 60);
  const voces = orgs.map((o, i) => voz({ nombre: 'P' + i, organizacion: o, id: 'x' + i + ':vision' }));
  const { p, ctx } = await abrir(() => ({ ok: true, voces, motor: motorBien() }), { extra: '&seccion=arbol&forma=burbujas' });
  await esperar(p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  await p.waitForTimeout(300);
  assert.equal(await p.locator('#vzArbol .arb-glob').count(), 60);
  await ctx.close();
});

test('modo oscuro: el botón "Todo" se ve (antes quedaba marino sobre marino)', async () => {
  const { p, ctx } = await abrir(null, { query: '', oscuro: true });
  await esperar(p, () => !!document.querySelector('#vzMom .m-todo'));
  await p.click('#vzMom .m-vision');
  const color = await p.evaluate(() => getComputedStyle(document.querySelector('#vzMom .m-todo')).color);
  assert.equal(color, 'rgb(234, 241, 246)');
  await ctx.close();
});

test('la ventana aparte del árbol sigue a los datos nuevos', async () => {
  let voces = [voz({ organizacion: 'SIAB' })];
  const { p, ctx } = await abrir(() => ({ ok: true, voces, motor: motorBien() }), { extra: '&seccion=arbol' });
  await esperar(p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  const [ventana] = await Promise.all([p.waitForEvent('popup'), p.click('#vzArbProy')]);
  await ventana.waitForTimeout(400);
  assert.equal(await ventana.locator('.arb-hoja').count(), 1);
  voces = voces.concat([voz({ organizacion: 'Cotelco', nombre: 'Luis' })]);
  await ventana.waitForTimeout(4000);
  assert.equal(await ventana.locator('.arb-hoja').count(), 2);
  await ctx.close();
});

test('build.py: con un prototipo, arma la vista integrada; con un prototipo que no calza, se detiene', () => {
  const dir = path.join(RAIZ, 'panel');
  const orig = path.join(dir, 'original.html'), salida = path.join(dir, 'Sistema_inteligencia_territorial_prototipo_v2.html');
  try {
    fs.writeFileSync(orig, '<!doctype html><html><head><style>:root{--p1:#000}</style></head><body><nav><span class="vista"></span></nav><main></main><script>function ver(v){document.getElementById("v-"+v).hidden=false}</script></body></html>');
    const out = execFileSync('python3', [path.join(dir, 'build.py')]).toString();
    assert.match(out, /Sistema_inteligencia_territorial_prototipo_v2\.html/);
    const h = fs.readFileSync(salida, 'utf8');
    assert.ok(h.indexOf('data-v="voz"') > 0 && h.indexOf('id="v-voz"') > 0 && h.indexOf('const LOGOS=') > 0);
    fs.writeFileSync(orig, '<html><body>otra cosa</body></html>');
    let fallo = null;
    try { execFileSync('python3', [path.join(dir, 'build.py')], { stdio: 'pipe' }); } catch (e) { fallo = e; }
    assert.ok(fallo, 'debe detenerse');
    assert.match(fallo.stdout.toString(), /ERROR/);
  } finally {
    fs.rmSync(orig, { force: true });
    fs.rmSync(salida, { force: true });
    execFileSync('python3', [path.join(dir, 'build.py')]);
  }
});

test('fuente mal escrita: lo avisa y no muestra datos de demostración; con barra final o espacios, la acepta', async () => {
  const a = await abrir(null, { query: '?fuente=' + encodeURIComponent('https://script.google.com/macros/s/X/ejecutar') + '&clave=k' });
  await esperar(a.p, () => /no es válida/.test(document.querySelector('#vzEstado').textContent));
  assert.equal(await a.p.locator('.vz-w').count(), 0, 'sin nube inventada');
  await a.ctx.close();
  const b = await abrir(() => ({ ok: true, voces: [voz()], motor: motorBien() }), { query: '?fuente=' + encodeURIComponent('  ' + FUENTE + '/ ') + '&clave=k&refresco=3' });
  await esperar(b.p, () => /En vivo/.test(document.querySelector('#vzEstado').textContent));
  await b.ctx.close();
});
