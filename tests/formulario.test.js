/**
 * Pruebas del formulario (index.html) en Chromium, con micrófono falso y un Apps Script simulado.
 * Correr:  node --test tests/*.test.js   (necesita Playwright; ver tests/correr_todo.sh)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const EXEC = /script\.google\.com\/macros/;
let servidor, base, navegador;

test.before(async () => {
  servidor = http.createServer((req, res) => {
    const f = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  base = 'http://localhost:' + servidor.address().port + '/index.html';
  const opciones = { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) opciones.executablePath = '/opt/pw-browsers/chromium';
  navegador = await chromium.launch(opciones);
});
test.after(async () => { await navegador.close(); servidor.close(); });

/** Abre el formulario con un servidor simulado. `responde(cuerpo, n)` devuelve lo que contesta el "Apps Script". */
async function abrir(responde, opciones) {
  opciones = opciones || {};
  const ctx = opciones.ctx || await navegador.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  const p = await ctx.newPage();
  const recibidos = [], errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.route('**/fonts.googleapis.com/**', r => r.abort());
  await p.route('**/fonts.gstatic.com/**', r => r.abort());
  await p.route(EXEC, async r => {
    const cuerpo = r.request().postData() ? JSON.parse(r.request().postData()) : null;
    recibidos.push(cuerpo);
    const [code, tipo, txt] = responde ? responde(cuerpo, recibidos.length) : [200, 'application/json', '{"ok":true}'];
    await r.fulfill({ status: code, contentType: tipo, body: txt, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  // los reintentos del formulario esperan 10-20 s; en la prueba, un poco menos
  await p.addInitScript(() => { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms >= 10000 && ms <= 20000 ? 400 : ms, ...a); });
  if (opciones.antes) await p.addInitScript(opciones.antes);
  await p.goto(base + (opciones.query || ''));
  return { p, ctx, recibidos, errores };
}
async function llenar(p, extra) {
  extra = extra || {};
  await p.fill('#nombre', extra.nombre || 'Ana Pérez');
  await p.fill('#org', 'SIAB');
  await p.fill('#rol', 'Gerente');
  await p.evaluate(() => document.querySelectorAll('[data-parte] details').forEach(d => { d.open = true; }));
  await p.fill('[data-parte="vision"] textarea', 'Riego para el campo');
  await p.fill('[data-parte="compromiso"] textarea', 'Aportar datos');
  await p.check('#acepto');
}
const esperar = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 8000 });
const enCola = p => p.evaluate(async () => (await Cola.todas()).length);
/** Espera a que la cola del teléfono tenga `n` respuestas (evaluate sí espera promesas; waitForFunction no). */
async function esperarCola(p, n, ms) {
  const fin = Date.now() + (ms || 10000);
  for (;;) {
    if (await enCola(p) === n) return;
    if (Date.now() > fin) throw new Error('la cola no llegó a ' + n + ' (tiene ' + await enCola(p) + ')');
    await p.waitForTimeout(150);
  }
}

test('envío normal: llega completo, da las gracias y bloquea un segundo envío', async () => {
  const { p, ctx, recibidos, errores } = await abrir();
  assert.equal(await p.isDisabled('#enviar'), true);
  await llenar(p);
  assert.equal(await p.isDisabled('#enviar'), false);
  await p.click('#enviar');
  await esperar(p, () => !document.querySelector('#gracias').hidden);
  assert.equal(recibidos.length, 1);
  const r = recibidos[0];
  assert.match(r.id, /^[A-Za-z0-9-]{8,64}$/);
  assert.equal(r.consentimiento, true);
  assert.equal(r.vision.texto, 'Riego para el campo');
  assert.equal(r._fallasRed, undefined);
  assert.equal(await enCola(p), 0);
  await p.reload();
  await esperar(p, () => /Ya recibimos/.test(document.querySelector('#grTxt').textContent));
  assert.deepEqual(errores, []);
  await ctx.close();
});

test('el servidor devuelve una página de error: queda en el teléfono y se envía sola cuando se recupera', async () => {
  let caido = true;
  const { p, ctx, recibidos } = await abrir(() => caido ? [200, 'text/html', '<html>Error</html>'] : [200, 'application/json', '{"ok":true}']);
  await llenar(p);
  await p.click('#enviar');
  await esperar(p, () => /conexión está lenta/.test(document.querySelector('#grTxt').textContent));
  assert.equal(await enCola(p), 1);
  caido = false;
  await esperar(p, () => /ya llegaron/.test(document.querySelector('#grTxt').textContent));
  assert.equal(await enCola(p), 0);
  const ids = new Set(recibidos.map(x => x.id));
  assert.equal(ids.size, 1, 'siempre la misma respuesta, con el mismo id');
  await ctx.close();
});

test('si la persona cierra la página con la respuesta pendiente, se envía al volver a abrirla', async () => {
  let caido = true;
  const ctx = await navegador.newContext({ permissions: ['microphone'] });
  const a = await abrir(() => caido ? [503, 'text/html', 'x'] : [200, 'application/json', '{"ok":true}'], { ctx });
  await llenar(a.p);
  await a.p.click('#enviar');
  await esperar(a.p, () => !document.querySelector('#gracias').hidden);
  await a.p.close();
  caido = false;
  const b = await abrir(() => [200, 'application/json', '{"ok":true}'], { ctx });
  await esperarCola(b.p, 0);
  assert.equal(b.recibidos.length, 1);
  assert.equal(b.recibidos[0].nombre, 'Ana Pérez');
  await ctx.close();
});

test('sin internet: se guarda; al volver la conexión, se envía', async () => {
  const { p, ctx, recibidos } = await abrir();
  await llenar(p);
  await ctx.setOffline(true);
  await p.click('#enviar');
  await esperar(p, () => /conexión está lenta/.test(document.querySelector('#grTxt').textContent));
  assert.equal(await enCola(p), 1);
  await ctx.setOffline(false);
  await esperar(p, () => /ya llegaron/.test(document.querySelector('#grTxt').textContent));
  assert.equal(recibidos.length, 1);
  await ctx.close();
});

test('modo ensayo: id de prueba, no bloquea el teléfono', async () => {
  const { p, ctx, recibidos } = await abrir(null, { query: '?ensayo=1' });
  assert.match(await p.textContent('#modoPrueba'), /Modo ensayo/);
  await llenar(p);
  await p.click('#enviar');
  await esperar(p, () => !document.querySelector('#gracias').hidden);
  assert.match(recibidos[0].id, /^prueba-/);
  await p.reload();
  assert.equal(await p.isHidden('#form'), false, 'puede volver a responder');
  await ctx.close();
});

test('la marca del ensayo con el formulario viejo no bloquea el día del evento; ?reiniciar=1 quita la actual', async () => {
  const ctx = await navegador.newContext();
  const a = await abrir(null, { ctx, antes: () => localStorage.setItem('vozEnviado', JSON.stringify({ id: 'viejo' })) });
  assert.equal(await a.p.isHidden('#form'), false);
  await llenar(a.p);
  await a.p.click('#enviar');
  await esperar(a.p, () => !document.querySelector('#gracias').hidden);
  await a.p.goto(base + '?reiniciar=1');
  assert.equal(await a.p.isHidden('#form'), false);
  assert.doesNotMatch(a.p.url(), /reiniciar/);
  await ctx.close();
});

test('lo que dejó pendiente la versión anterior del formulario también se envía', async () => {
  const viejo = { id: 'viejo-123456789', nombre: 'Pendiente Vieja', organizacion: 'Cotelco', rol: 'x', consentimiento: true, vision: { texto: 'a' }, compromiso: { texto: 'b' }, cliente: '2026-09-24T10:00:00Z' };
  const { p, ctx, recibidos } = await abrir(null, { antes: v => { if (!sessionStorage.getItem('ya')) { sessionStorage.setItem('ya', '1'); localStorage.setItem('vozCola', JSON.stringify([v])); } }, query: '' });
  await p.evaluate(v => { localStorage.setItem('vozCola', JSON.stringify([v])); }, viejo);
  await p.reload();
  await esperar(p, () => !localStorage.getItem('vozCola'));
  await esperarCola(p, 0);
  assert.ok(recibidos.some(x => x && x.id === 'viejo-123456789'));
  await ctx.close();
});

test('doble toque en Enviar: un solo envío', async () => {
  const { p, ctx, recibidos } = await abrir((c, n) => [200, 'application/json', '{"ok":true}']);
  await llenar(p);
  await p.evaluate(() => { const b = document.querySelector('#enviar'); b.click(); b.click(); document.querySelector('#form').requestSubmit(); });
  await esperar(p, () => !document.querySelector('#gracias').hidden);
  await p.waitForTimeout(500);
  assert.equal(new Set(recibidos.map(x => x.id)).size, 1);
  await ctx.close();
});

test('grabar una nota de voz con el micrófono: llega el audio', async () => {
  const { p, ctx, recibidos, errores } = await abrir();
  await p.fill('#nombre', 'Ana'); await p.fill('#org', 'SIAB'); await p.fill('#rol', 'Gerente');
  await p.click('[data-parte="vision"] .grabar');
  await p.waitForTimeout(1600);
  await p.click('[data-parte="vision"] .grabar');
  await esperar(p, () => !document.querySelector('[data-parte="vision"] .lista').hidden);
  await p.evaluate(() => { const d = document.querySelector('[data-parte="compromiso"] details'); d.open = true; });
  await p.fill('[data-parte="compromiso"] textarea', 'Aportar datos');
  await p.check('#acepto');
  await p.click('#enviar');
  await esperar(p, () => !document.querySelector('#gracias').hidden);
  const a = recibidos[0].vision.audio;
  assert.ok(a && a.base64.length > 1000, 'trae el audio');
  assert.match(a.mime, /^audio\//);
  assert.deepEqual(errores, []);
  await ctx.close();
});

test('una grabación nueva que falla no borra la anterior', async () => {
  const { p, ctx } = await abrir();
  await p.click('[data-parte="vision"] .grabar');
  await p.waitForTimeout(1300);
  await p.click('[data-parte="vision"] .grabar');
  await esperar(p, () => !document.querySelector('[data-parte="vision"] .lista').hidden);
  // ahora el micrófono deja de estar disponible
  await p.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); });
  await p.click('[data-parte="vision"] .grabar');
  await esperar(p, () => /micrófono/.test(document.querySelector('#err').textContent));
  assert.equal(await p.isHidden('[data-parte="vision"] .lista'), false, 'la nota anterior sigue ahí');
  await ctx.close();
});

test('permiso de micrófono negado: explica y abre la opción de escribir, sin pedirlo dos veces', async () => {
  const { p, ctx } = await abrir(null, { antes: () => {
    window.__pedidos = 0;
    navigator.mediaDevices.getUserMedia = () => { window.__pedidos++; return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); };
  } });
  await p.click('[data-parte="vision"] .grabar');
  await esperar(p, () => /micrófono/.test(document.querySelector('#err').textContent));
  assert.equal(await p.evaluate(() => document.querySelector('[data-parte="vision"] details').open), true);
  assert.equal(await p.evaluate(() => window.__pedidos), 1);
  await ctx.close();
});

test('respaldo no-cors: si el navegador no deja leer la respuesta, a la tercera se manda igual', async () => {
  const { p, ctx } = await abrir(null, { antes: () => {
    window.__llamadas = [];
    window.fetch = async (u, o) => { window.__llamadas.push(o.mode || 'cors'); if (o.mode === 'no-cors') return new Response(null, { status: 200 }); throw new TypeError('Failed to fetch'); };
  } });
  await llenar(p);
  await p.click('#enviar');
  await esperar(p, () => !document.querySelector('#gracias').hidden);
  await esperarCola(p, 0, 10000);
  assert.deepEqual(await p.evaluate(() => window.__llamadas), ['cors', 'cors', 'cors', 'no-cors']);
  await ctx.close();
});

test('los campos tienen el mismo límite de largo que el servidor', async () => {
  const { p, ctx } = await abrir();
  assert.equal(await p.getAttribute('#nombre', 'maxlength'), '120');
  assert.equal(await p.getAttribute('#org', 'maxlength'), '160');
  assert.equal(await p.getAttribute('[data-parte="vision"] textarea', 'maxlength'), '3000');
  await ctx.close();
});
