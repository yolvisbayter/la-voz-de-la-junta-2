/**
 * Pruebas del generador de carteles (carteles_qr.html) en Chromium.
 * La librería del QR se reemplaza por una falsa que anota qué dirección se le pidió codificar.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RUTA = path.join(__dirname, '..', 'carteles_qr.html');
let navegador;
test.before(async () => {
  const op = {};
  if (fs.existsSync('/opt/pw-browsers/chromium')) op.executablePath = '/opt/pw-browsers/chromium';
  navegador = await chromium.launch(op);
});
test.after(() => navegador.close());

async function abrir(sinLibreria) {
  const p = await navegador.newPage();
  await p.route('**/fonts.googleapis.com/**', r => r.abort());
  await p.route('**/qrcode.min.js', r => sinLibreria ? r.abort() : r.fulfill({
    contentType: 'application/javascript',
    body: 'window.__qr=[];function QRCode(el,o){window.__qr.push(o.text);el.appendChild(document.createElement("canvas"))}QRCode.CorrectLevel={M:0};'
  }));
  await p.goto('file://' + RUTA);
  return p;
}
async function generar(p, url) {
  await p.fill('#url', url);
  await p.click('#gen');
  return { aviso: await p.textContent('#aviso'), carteles: await p.locator('.cartel').count() };
}

test('dirección válida: un cartel con su QR y la dirección escrita debajo', async () => {
  const p = await abrir();
  const r = await generar(p, '  https://yolvisbayter.github.io/la-voz-de-la-junta-2/  ');
  assert.equal(r.aviso, '');
  assert.equal(r.carteles, 1);
  assert.deepEqual(await p.evaluate(() => window.__qr), ['https://yolvisbayter.github.io/la-voz-de-la-junta-2/']);
  assert.equal(await p.textContent('.cartel .dir'), 'yolvisbayter.github.io/la-voz-de-la-junta-2/');
  assert.equal(await p.getAttribute('#probar a', 'href'), 'https://yolvisbayter.github.io/la-voz-de-la-junta-2/');
  await p.close();
});

test('rechaza lo que daría un cartel inútil', async () => {
  const p = await abrir();
  for (const u of ['', 'http://ejemplo.org/', 'https://script.google.com/macros/s/x/exec', 'https://x.github.io/y/?ensayo=1']) {
    const r = await generar(p, u);
    assert.notEqual(r.aviso, '', 'debe avisar para: ' + u);
    assert.equal(r.carteles, 0);
  }
  await p.close();
});

test('sin la librería del QR (sin internet): lo dice, no imprime un cartel sin QR', async () => {
  const p = await abrir(true);
  const r = await generar(p, 'https://x.github.io/y/');
  assert.match(r.aviso, /librería del QR/);
  assert.equal(r.carteles, 0);
  await p.close();
});
