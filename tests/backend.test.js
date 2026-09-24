/**
 * Pruebas del backend (apps_script/Codigo.gs) sobre el simulador de Apps Script.
 * Correr:  node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, ok, vacia, error, respuestasDelPrompt, esAudio, clasificadorFalso } = require('./simulador_apps_script.js');

const AUDIO = Buffer.from('audio falso de prueba '.repeat(20)).toString('base64');
let n = 0;
const nuevoId = () => 'abcdefgh-' + (++n) + '-' + Date.now().toString(36);
const respuesta = (extra) => Object.assign({
  id: nuevoId(), nombre: 'Ana Pérez', organizacion: 'SIAB', rol: 'Gerente', consentimiento: true,
  vision: { texto: 'Riego para el campo de María la Baja' }, compromiso: { texto: 'Aportar datos de trámites' },
  cliente: '2026-09-25T15:00:00.000Z'
}, extra || {});

function listo(opciones) {
  const e = crearEntorno(opciones);
  e.configurar();
  e.S.gemini = q => esAudio(q) ? ok('Necesitamos agua para el riego') : clasificadorFalso()(q);
  return e;
}
const correr = (e, veces) => { for (let i = 0; i < (veces || 1); i++) { e.g.procesarPendientes(); e.adelantar(60000); } };

test('configurar deja la hoja, carpetas, clave y un solo disparador', () => {
  const e = crearEntorno();
  e.configurar();
  const cab = e.hoja()._h.datos[0];
  assert.deepEqual(cab, e.COLUMNAS);
  assert.equal(e.S.triggers.length, 1);
  assert.ok(e.S.props.PANEL_TOKEN && e.S.props.CARPETA_ID && e.S.props.BANDEJA_ID);
  e.configurar();  // dos veces no duplica nada
  assert.equal(e.S.triggers.length, 1);
  assert.deepEqual(e.hoja()._h.datos[0], e.COLUMNAS);
});

test('flujo completo: envío con audio y texto -> transcrito, ubicado y en el panel', () => {
  const e = listo();
  const r = e.enviar(respuesta({ vision: { texto: '', audio: { base64: AUDIO, mime: 'audio/webm;codecs=opus', seg: 12 } } }));
  assert.equal(r.ok, true);
  correr(e);
  const f = e.filas()[0];
  assert.equal(f.vision_transcripcion, 'Necesitamos agua para el riego');
  assert.equal(f.vision_palanca, 'agua');
  assert.equal(f.compromiso_palanca, 'reglas');
  assert.equal(f.estado_ia, 'listo');
  assert.ok(f.enviado instanceof Date);
  const datos = JSON.parse(e.get({ accion: 'datos', token: e.S.props.PANEL_TOKEN }));
  assert.equal(datos.ok, true);
  assert.equal(datos.voces.length, 2);
  assert.equal(datos.voces[0].palanca, 'agua');
  assert.equal(datos.voces[0].audio, true);
  assert.deepEqual(datos.voces[0].palabras, ['agua', 'riego']);
  assert.ok(datos.motor && datos.motor.version);
  // el audio llegó a Gemini con un tipo que entiende
  const pedido = e.S.llamadas.find(l => l.cuerpo.contents[0].parts[1]);
  assert.equal(pedido.cuerpo.contents[0].parts[1].inline_data.mime_type, 'audio/webm');
});

test('un nombre que empieza por = no se vuelve fórmula', () => {
  const e = listo();
  e.enviar(respuesta({ nombre: '=IMPORTXML("http://x","//a")', organizacion: '+57 algo', rol: '-gerente' }));
  correr(e);
  const f = e.filas()[0];
  assert.equal(f.nombre, '=IMPORTXML("http://x","//a")');
  assert.equal(f.organizacion, '+57 algo');
});

test('reenvío del mismo id: responde ok y no duplica audio ni fila', () => {
  const e = listo();
  const d = respuesta({ vision: { audio: { base64: AUDIO, mime: 'audio/mp4' } } });
  assert.equal(e.enviar(d).ok, true);
  const audios = e.archivosEn(e.S.props.CARPETA_ID).length;
  const r2 = e.enviar(d);
  assert.equal(r2.ok, true);
  assert.equal(r2.repetido, true);
  assert.equal(e.archivosEn(e.S.props.CARPETA_ID).length, audios);
  correr(e);
  e.S.cache = {};  // aunque la caché se pierda y la ficha ya se haya ingresado
  e.enviar(d);
  correr(e);
  assert.equal(e.filas().length, 1);
});

test('rechaza lo que no se debe guardar', () => {
  const e = listo();
  assert.equal(e.enviar(respuesta({ id: 'x y' })).ok, false);
  assert.equal(e.enviar(respuesta({ consentimiento: false })).ok, false);
  assert.equal(e.enviar(respuesta({ nombre: '' })).ok, false);
  assert.equal(e.enviar('esto no es json').ok, false);
  assert.equal(e.enviar({}).ok, false);
});

test('audio dañado en el envío: se guarda el texto, no se pierde la respuesta', () => {
  const e = listo();
  const r = e.enviar(respuesta({ vision: { texto: 'Riego ya', audio: { base64: '%%%no-es-base64%%%'.repeat(10), mime: 'audio/webm' } } }));
  assert.equal(r.ok, true);
  correr(e);
  const f = e.filas()[0];
  assert.equal(f.vision_audio_id, '');
  assert.equal(f.vision_palanca, 'agua');
});

test('JSON inválido de la IA en la tanda: se reparte de a una en la misma ejecución', () => {
  const e = listo();
  for (let i = 0; i < 3; i++) e.enviar(respuesta());
  let primera = true;
  e.S.gemini = q => {
    if (respuestasDelPrompt(q).length > 1 && primera) { primera = false; return ok('esto no es json'); }
    return clasificadorFalso()(q);
  };
  correr(e);
  e.filas().forEach(f => { assert.equal(f.estado_ia, 'listo'); assert.equal(Number(f.intentos), 0); });
});

test('una respuesta que la IA siempre bloquea no frena a las demás', () => {
  const e = listo();
  e.S.gemini = clasificadorFalso({ veneno: 'VENENO' });
  e.enviar(respuesta({ vision: { texto: 'Texto VENENO' } }));
  for (let i = 0; i < 4; i++) e.enviar(respuesta());
  correr(e);
  const filas = e.filas();
  assert.equal(filas.filter(f => f.estado_ia === 'listo').length, 4);
  assert.equal(filas[0].estado_ia, 'pendiente');
  assert.equal(Number(filas[0].intentos), 1);
  correr(e, 8);
  assert.match(e.filas()[0].estado_ia, /^error/);
  assert.equal(e.filas()[0].compromiso_palanca, 'reglas');  // la otra parte de la misma persona sí quedó
});

test('Gemini saturado (503): no gasta intentos y no martilla', () => {
  const e = listo();
  e.S.gemini = () => error(503, 'UNAVAILABLE', 'The model is overloaded');
  e.enviar(respuesta());
  correr(e);
  assert.equal(e.S.llamadas.length, 4);  // una tanda x cuatro modelos, y a esperar
  assert.equal(Number(e.filas()[0].intentos), 0);
  correr(e, 8);
  assert.equal(Number(e.filas()[0].intentos), 0);
  correr(e);  // décimo minuto seguido: ahora sí cuenta uno
  assert.equal(Number(e.filas()[0].intentos), 1);
  assert.equal(e.filas()[0].estado_ia, 'pendiente');
  e.S.gemini = clasificadorFalso();
  correr(e);
  assert.equal(e.filas()[0].estado_ia, 'listo');
});

test('clave inválida (400 API_KEY_INVALID): es de configuración, no gasta intentos y queda registrada', () => {
  const e = listo();
  e.S.gemini = () => error(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key. [API_KEY_INVALID]');
  e.enviar(respuesta());
  correr(e, 3);
  assert.equal(Number(e.filas()[0].intentos), 0);
  const fallo = JSON.parse(e.S.props.ULTIMO_FALLO);
  assert.equal(fallo.codigo, 400);
  assert.match(fallo.detalle, /API key not valid/);
});

test('audio borrado de Drive: solo esa fila suma intento, las demás siguen', () => {
  const e = listo();
  e.enviar(respuesta({ vision: { audio: { base64: AUDIO, mime: 'audio/webm' } } }));
  e.enviar(respuesta({ vision: { audio: { base64: AUDIO, mime: 'audio/webm' } } }));
  e.g.ingresarFichas_({});
  const f0 = e.filas()[0];
  e.S.archivos[f0.vision_audio_id].papelera = true;
  correr(e);
  const filas = e.filas();
  assert.equal(filas[1].estado_ia, 'listo');
  assert.equal(Number(filas[0].intentos), 1);
});

test('si alguien reordena la hoja mientras Gemini responde, cada resultado cae en su fila', () => {
  const e = listo();
  e.enviar(respuesta({ nombre: 'Uno', vision: { texto: 'riego' }, compromiso: { texto: 'agua' } }));
  e.enviar(respuesta({ nombre: 'Dos', vision: { texto: 'energía' }, compromiso: { texto: 'energía cara' } }));
  e.g.ingresarFichas_({});
  const d = e.hoja()._h.datos;
  e.S.gemini = q => {
    const t = d[1]; d[1] = d[2]; d[2] = t;  // el equipo ordena la hoja justo ahora
    return clasificadorFalso()(q);
  };
  correr(e);
  e.filas().forEach(f => assert.equal(f.vision_palanca, f.nombre === 'Uno' ? 'agua' : 'energia'));
});

test('candado: si otra ejecución trabaja, esta no arranca', () => {
  const e = listo();
  e.enviar(respuesta());
  e.S.locked = true;
  e.g.procesarPendientes();
  assert.equal(e.filas().length, 0);
});

test('sin trabajo, el disparador sale sin tocar Drive ni la hoja (cuida el tope diario)', () => {
  const e = listo();
  e.enviar(respuesta());
  correr(e, 3);  // procesa y, pasado el minuto, apaga la señal de fichas
  assert.equal(e.S.props.HAY_FICHAS, undefined);
  e.S.cuentas = { drive: 0, sheet: 0 };
  e.g.procesarPendientes();
  assert.deepEqual(e.S.cuentas, { drive: 0, sheet: 0 });
  assert.ok(Number(e.S.props.LATIDO) > 0);
  // y cada tanto revisa todo aunque no haya señal
  e.adelantar(11 * 60000);
  e.g.procesarPendientes();
  assert.ok(e.S.cuentas.sheet > 0);
});

test('una respuesta que llega mientras el motor trabaja no queda olvidada', () => {
  const e = listo();
  e.enviar(respuesta());
  e.adelantar(120000);
  const señal = e.S.props.HAY_FICHAS;
  let enviada = false;
  const base = e.S.gemini;
  e.S.gemini = q => { if (!enviada) { enviada = true; e.adelantar(1000); e.enviar(respuesta({ nombre: 'Tardía' })); } return base(q); };
  e.g.procesarPendientes();
  assert.notEqual(e.S.props.HAY_FICHAS, undefined, 'la señal nueva no se debe borrar');
  assert.notEqual(e.S.props.HAY_FICHAS, señal);
  e.adelantar(60000);
  e.g.procesarPendientes();
  assert.ok(e.filas().some(f => f.nombre === 'Tardía'));
});

test('nunca empieza una llamada a Gemini que pueda pasarse de los 6 minutos', () => {
  const e = listo();
  for (let i = 0; i < 40; i++) e.enviar(respuesta({ vision: { audio: { base64: AUDIO, mime: 'audio/webm' } } }));
  e.S.demora = 40000;  // Gemini lento: cada tanda tarda 40 s
  const t0 = e.S.reloj;
  e.g.procesarPendientes();
  const ultima = Math.max(...e.S.llamadas.map(l => l.momento));
  assert.ok(ultima - t0 <= (330 - 65) * 1000, 'la última llamada empezó en el segundo ' + (ultima - t0) / 1000);
  assert.ok(e.S.reloj - t0 < 360000, 'la ejecución duró ' + (e.S.reloj - t0) / 1000 + ' s');
  assert.equal(e.S.locked, false);
});

test('las filas se arman por el encabezado real aunque el equipo agregue una columna en el medio', () => {
  const e = listo();
  const sh = e.hoja();
  // el equipo inserta una columna "comentario" después de "nombre"
  sh._h.maxC++;
  sh._h.datos.forEach(f => { if (f) f.splice(3, 0, ''); });
  sh._h.datos[0][3] = 'comentario';
  e.enviar(respuesta({ nombre: 'Carla', organizacion: 'Cotelco' }));
  correr(e);
  const f = e.filas()[0];
  assert.equal(f.nombre, 'Carla');
  assert.equal(f.organizacion, 'Cotelco');
  assert.equal(f.comentario, '');
  assert.equal(f.vision_palanca, 'agua');
});

test('una hoja de la v2 (sin columna enviado) se completa sola, al final', () => {
  const e = crearEntorno();
  e.configurar();
  const cab = e.hoja()._h.datos[0];
  cab.pop();  // la hoja vieja no tenía "enviado"
  e.S.gemini = clasificadorFalso();
  e.enviar(respuesta());
  correr(e);
  assert.equal(e.hoja()._h.datos[0][e.hoja()._h.datos[0].length - 1], 'enviado');
  assert.ok(e.filas()[0].enviado instanceof Date);
});

test('una hoja con pocas filas crece sola', () => {
  const e = listo();
  e.hoja()._h.maxR = 3;
  for (let i = 0; i < 6; i++) e.enviar(respuesta());
  correr(e);
  assert.equal(e.filas().length, 6);
});

test('una ficha ilegible va a cuarentena, no a la papelera, y no frena a las demás', () => {
  const e = listo();
  const bandeja = e.g.DriveApp.getFolderById(e.S.props.BANDEJA_ID);
  bandeja.createFile('rota.json', '{esto no es json', 'application/json');
  e.enviar(respuesta());
  e.S.props.HAY_FICHAS = String(e.S.reloj);
  correr(e);
  assert.equal(e.filas().length, 1);
  const rota = Object.values(e.S.archivos).find(f => f.nombre === 'rota.json');
  assert.equal(rota.papelera, false);
  assert.equal(rota.carpeta, e.S.props.CUARENTENA_ID);
});

test('nota de voz inaudible: no se queda "procesando" para siempre', () => {
  const e = listo();
  e.S.gemini = q => esAudio(q) ? ok('[Inaudible]') : clasificadorFalso()(q);
  e.enviar(respuesta({ vision: { texto: '', audio: { base64: AUDIO, mime: 'audio/webm' } } }));
  e.enviar(respuesta({ nombre: 'Con texto', vision: { texto: 'Riego', audio: { base64: AUDIO, mime: 'audio/webm' } } }));
  correr(e);
  const [a, b] = e.filas();
  assert.equal(a.vision_transcripcion, '(inaudible)');
  assert.equal(a.estado_ia, 'listo');
  assert.equal(b.vision_palanca, 'agua');  // se ubicó con lo que escribió
  const voces = JSON.parse(e.get({ accion: 'datos', token: e.S.props.PANEL_TOKEN })).voces;
  const va = voces.find(v => v.nombre === 'Ana Pérez' && v.momento === 1);
  assert.equal(va.procesando, false);
  assert.equal(va.fallida, true);
});

test('ocultar y palanca validada escritos a mano de cualquier forma', () => {
  const e = listo();
  e.enviar(respuesta({ nombre: 'Oculta' }));
  e.enviar(respuesta({ nombre: 'Validada' }));
  correr(e);
  const d = e.hoja()._h.datos, cab = d[0];
  d[1][cab.indexOf('ocultar')] = 'TRUE';
  d[2][cab.indexOf('vision_palanca_validada')] = 'Reglas claras';
  const voces = JSON.parse(e.get({ accion: 'datos', token: e.S.props.PANEL_TOKEN })).voces;
  assert.equal(voces.filter(v => v.nombre === 'Oculta').length, 0);
  const v = voces.find(x => x.nombre === 'Validada' && x.momento === 1);
  assert.equal(v.palanca, 'reglas');
  assert.equal(v.validada, true);
});

test('doGet: clave, JSONP, acciones de operador', () => {
  const e = listo();
  const t = e.S.props.PANEL_TOKEN;
  assert.equal(JSON.parse(e.get({ accion: 'datos', token: 'mala' })).ok, false);
  assert.equal(JSON.parse(e.get({})).ok, true);
  const jsonp = e.get({ accion: 'datos', token: t, callback: 'cb123' });
  assert.match(jsonp, /^cb123\(\{.*\}\);$/s);
  assert.doesNotMatch(e.get({ accion: 'datos', token: t, callback: 'alert(1)//' }), /^alert/);
  e.enviar(respuesta());
  const proc = JSON.parse(e.get({ accion: 'procesar', token: t }));
  assert.equal(proc.ok, true);
  assert.equal(proc.resultado.hecho, true);
  assert.equal(e.filas()[0].estado_ia, 'listo');
  assert.equal(e.S.props.LATIDO, undefined, 'el respaldo del panel no finge el latido del disparador');
  const est = JSON.parse(e.get({ accion: 'estado', token: t }));
  assert.equal(est.motor.disparador, 1);
  assert.equal(JSON.parse(e.get({ accion: 'reintentar', token: t })).devueltas, 0);
  assert.equal(JSON.parse(e.get({ accion: 'otra', token: t })).ok, false);
});

test('reintentarErrores devuelve a la cola las filas en error', () => {
  const e = listo();
  e.S.gemini = clasificadorFalso({ veneno: 'Riego' });
  e.enviar(respuesta());
  correr(e, 9);
  assert.match(e.filas()[0].estado_ia, /^error/);
  e.g.reintentarErrores();
  assert.equal(e.filas()[0].estado_ia, 'pendiente');
  e.S.gemini = clasificadorFalso();
  correr(e);
  assert.equal(e.filas()[0].estado_ia, 'listo');
});

test('archivarEnsayo copia todo a otra pestaña y deja Voces vacía', () => {
  const e = listo();
  for (let i = 0; i < 5; i++) e.enviar(respuesta());
  correr(e);
  e.enviar(respuesta({ nombre: 'En la bandeja' }));  // todavía sin procesar
  e.g.archivarEnsayo();
  assert.equal(e.filas().length, 0);
  const copia = e.libro.hojas.find(h => /^Ensayo /.test(h.getName()));
  assert.ok(copia, 'debe existir la pestaña Ensayo');
  assert.equal(copia._h.datos.filter(f => f && f[0]).length - 1, 6);
  assert.deepEqual(e.hoja()._h.datos[0], e.COLUMNAS);
  // y el sistema sigue funcionando después
  e.enviar(respuesta({ nombre: 'Real' }));
  correr(e);
  assert.equal(e.filas()[0].nombre, 'Real');
});

test('borrarPruebas borra solo las de prueba, aunque sean todas o estén salteadas', () => {
  const e = listo();
  e.hoja()._h.maxR = 4;
  e.enviar(respuesta({ id: 'prueba-1111-aaaa' }));
  e.enviar(respuesta({ nombre: 'Real' }));
  e.enviar(respuesta({ id: 'prueba-2222-bbbb' }));
  e.enviar(respuesta({ id: 'prueba-3333-cccc' }));
  correr(e);
  e.g.borrarPruebas();
  assert.deepEqual(e.filas().map(f => f.nombre), ['Real']);
  const e2 = listo();
  e2.hoja()._h.maxR = 3;
  e2.enviar(respuesta({ id: 'prueba-4444-dddd' }));
  e2.enviar(respuesta({ id: 'prueba-5555-eeee' }));
  correr(e2);
  e2.g.borrarPruebas();
  assert.equal(e2.filas().length, 0);
});

test('la IA devuelve la lista envuelta en un objeto o con una palanca inventada', () => {
  const e = listo();
  e.enviar(respuesta());
  e.enviar(respuesta());
  e.S.gemini = q => {
    const rs = respuestasDelPrompt(q);
    if (rs.length > 1) return ok(JSON.stringify({ respuestas: rs.map((t, i) => ({ n: i + 1, palanca: i === 0 ? 'turismo' : 'agua', sector: 'agro', resumen: 'r', confianza: 'alta', palabras: ['agua, riego'] })) }));
    return clasificadorFalso()(q);
  };
  correr(e);
  e.filas().forEach(f => assert.equal(f.estado_ia, 'listo'));
  const cab = e.hoja()._h.datos[0];
  assert.ok(e.filas().every(f => !/,.*,/.test(f.vision_palabras)), 'una palabra con coma no se parte en dos');
  assert.ok(cab.length > 0);
});

test('sin clave de Gemini: la etapa se detiene, queda registrado y no revienta', () => {
  const e = listo();
  delete e.S.props.GEMINI_API_KEY_2;
  e.enviar(respuesta());
  assert.doesNotThrow(() => correr(e));
  assert.match(JSON.parse(e.S.props.ULTIMO_FALLO).detalle, /falta la clave/);
  assert.equal(e.filas()[0].estado_ia, 'pendiente');
});

test('mime: Drive dice video/webm o audio/x-m4a; a Gemini le llega un tipo de audio', () => {
  const e = listo();
  assert.equal(e.g.mimeAudio_('video/webm', 'x.webm'), 'audio/webm');
  assert.equal(e.g.mimeAudio_('audio/x-m4a', ''), 'audio/mp4');
  assert.equal(e.g.mimeAudio_('video/mp4', ''), 'audio/mp4');
  assert.equal(e.g.mimeAudio_('application/octet-stream', 'vision_x.ogg'), 'audio/ogg');
  assert.equal(e.g.mimeAudio_('', ''), 'audio/webm');
});

test('diagnostico corre en una instalación nueva y en una en uso', () => {
  const e = crearEntorno();
  assert.doesNotThrow(() => e.g.diagnostico());
  e.configurar();
  e.S.gemini = clasificadorFalso();
  e.enviar(respuesta());
  correr(e);
  const L = e.g.diagnostico();
  assert.ok(L.some(l => /Disparador de cada minuto: 1/.test(l)));
});

test('revisarDuplicados avisa sin tocar nada', () => {
  const e = listo();
  e.enviar(respuesta({ nombre: 'Ana Pérez' }));
  e.enviar(respuesta({ nombre: 'ana perez' }));
  correr(e);
  const antes = JSON.stringify(e.hoja()._h.datos);
  e.g.revisarDuplicados();
  assert.equal(JSON.stringify(e.hoja()._h.datos), antes);
  assert.ok(e.S.logs.some(l => /Posibles duplicados/.test(l)));
});

test('carga: 200 personas con audio en las dos preguntas quedan listas', () => {
  const e = listo();
  for (let i = 0; i < 200; i++) e.enviar(respuesta({ vision: { audio: { base64: AUDIO, mime: 'audio/mp4' } }, compromiso: { audio: { base64: AUDIO, mime: 'audio/webm' } } }));
  e.S.demora = 8000;  // cada tanda de Gemini tarda 8 s
  let vueltas = 0;
  while (e.filas().filter(f => f.estado_ia === 'listo').length < 200 && vueltas < 20) { correr(e); vueltas++; }
  assert.equal(e.filas().filter(f => f.estado_ia === 'listo').length, 200);
  assert.ok(vueltas <= 6, 'tardó ' + vueltas + ' minutos');
});
