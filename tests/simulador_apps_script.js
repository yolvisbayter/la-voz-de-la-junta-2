/**
 * Simulador de Google Apps Script para probar apps_script/Codigo.gs sin internet.
 *
 * Imita lo que el backend usa: la hoja (con límites reales de filas y columnas, y
 * fórmulas: un texto que empieza por "=" hace fallar la prueba), Drive (carpetas,
 * archivos, papelera, mover), propiedades, caché, candado, disparadores, Gemini
 * (un manejador que decide qué responde cada llamada) y un reloj que se puede adelantar.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RUTA_CODIGO = path.join(__dirname, '..', 'apps_script', 'Codigo.gs');

function crearEntorno(op) {
  op = op || {};
  const S = {
    reloj: 1790000000000,          // milisegundos; se adelanta a mano o desde el Gemini falso
    props: Object.assign(op.sinClaves ? {} : { GEMINI_API_KEY: 'clave-audio-falsa', GEMINI_API_KEY_2: 'clave-texto-falsa' }, op.props || {}),
    cache: {},
    locked: false,
    triggers: [],
    carpetas: {},
    archivos: {},
    hojas: {},
    llamadas: [],                  // cada petición a Gemini
    logs: [],
    cuentas: { drive: 0, sheet: 0 }, // para medir cuánto trabaja una ejecución vacía
    gemini: null,
    fetchUrl: null
  };
  let nid = 0;
  const nuevoId = p => p + (++nid);

  // ---------- Reloj ----------
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(S.reloj); else super(...a); }
    static now() { return S.reloj; }
  }

  // ---------- Hoja ----------
  const quitaApostrofo = v => (typeof v === 'string' && v[0] === "'") ? v.slice(1) : v;
  function crearHoja(nombre, filas, columnas) {
    const h = { nombre, datos: [], maxR: filas || 1000, maxC: columnas || 26, congeladas: 0, validaciones: [] };
    const celda = (r, c) => (h.datos[r] && h.datos[r][c] !== undefined) ? h.datos[r][c] : '';
    const ultimaFila = () => { for (let r = h.datos.length - 1; r >= 0; r--) if (h.datos[r] && h.datos[r].some(v => v !== '' && v !== undefined && v !== null)) return r + 1; return 0; };
    const ultimaCol = () => { let m = 0; h.datos.forEach(f => { if (!f) return; for (let c = f.length - 1; c >= 0; c--) if (f[c] !== '' && f[c] !== undefined && f[c] !== null) { m = Math.max(m, c + 1); break; } }); return m; };
    const rango = (r, c, nr, nc) => {
      nr = nr || 1; nc = nc || 1;
      if (r < 1 || c < 1 || r + nr - 1 > h.maxR || c + nc - 1 > h.maxC) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      const R = {
        getValues: () => { S.cuentas.sheet++; const out = []; for (let i = 0; i < nr; i++) { const f = []; for (let j = 0; j < nc; j++) f.push(celda(r - 1 + i, c - 1 + j)); out.push(f); } return out; },
        setValues: v => {
          S.cuentas.sheet++;
          if (v.length !== nr || v.some(f => f.length !== nc)) throw new Error('The number of rows or columns in the data does not match the range.');
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
            const x = v[i][j];
            if (typeof x === 'string' && /^[=+\-@]/.test(x)) throw new Error('FÓRMULA ESCRITA EN LA HOJA: ' + x);
            (h.datos[r - 1 + i] = h.datos[r - 1 + i] || [])[c - 1 + j] = quitaApostrofo(x);
          }
          return R;
        },
        setFontWeight: () => R,
        setDataValidation: dv => { h.validaciones.push({ r, c, nr, nc, dv }); return R; },
        clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (h.datos[r - 1 + i]) h.datos[r - 1 + i][c - 1 + j] = ''; return R; }
      };
      return R;
    };
    const sheet = {
      _h: h,
      getName: () => h.nombre,
      setName: n => { h.nombre = n; return sheet; },
      getDataRange: () => { const lr = Math.max(ultimaFila(), 1), lc = Math.max(ultimaCol(), 1); return rango(1, 1, lr, lc); },
      getLastRow: ultimaFila,
      getLastColumn: ultimaCol,
      getMaxRows: () => h.maxR,
      getMaxColumns: () => h.maxC,
      getRange: rango,
      insertRowsAfter: (despues, n) => { h.maxR += n; if (despues < h.datos.length) h.datos.splice(despues, 0, ...Array.from({ length: n }, () => [])); return sheet; },
      insertColumnsAfter: (despues, n) => { h.maxC += n; return sheet; },
      deleteRows: (ini, n) => {
        if (ini < 1 || ini + n - 1 > h.maxR) throw new Error('Those rows are out of bounds.');
        if (h.maxR - n <= h.congeladas) throw new Error('Sorry, it is not possible to delete all non-frozen rows.');
        h.datos.splice(ini - 1, n); h.maxR -= n; return sheet;
      },
      deleteRow: r => sheet.deleteRows(r, 1),
      setFrozenRows: n => { h.congeladas = n; return sheet; },
      getFrozenRows: () => h.congeladas,
      copyTo: ss => {
        const copia = crearHoja('Copia de ' + h.nombre, h.maxR, h.maxC);
        copia._h.datos = h.datos.map(f => f ? f.slice() : f);
        ss._agregar(copia);
        return copia;
      }
    };
    return sheet;
  }
  const libro = { nombre: 'Sin título', hojas: [] };
  const ss = {
    getName: () => libro.nombre,
    rename: n => { libro.nombre = n; },
    getSheetByName: n => libro.hojas.find(x => x.getName() === n) || null,
    insertSheet: n => { const sh = crearHoja(n); libro.hojas.push(sh); return sh; },
    getSheets: () => libro.hojas.slice(),
    deleteSheet: sh => { libro.hojas = libro.hojas.filter(x => x !== sh); },
    _agregar: sh => {
      const nombre = sh.getName();
      const orig = sh.setName;
      sh.setName = n => { if (libro.hojas.some(x => x !== sh && x.getName() === n)) throw new Error('Ya existe una hoja con ese nombre'); return orig(n); };
      libro.hojas.push(sh);
      return nombre;
    }
  };
  libro.hojas.push(crearHoja('Hoja 1'));

  // ---------- Drive ----------
  function apiArchivo(id) {
    const a = () => S.archivos[id];
    return {
      getId: () => id,
      getUrl: () => 'https://drive.google.com/file/d/' + id,
      getName: () => a().nombre,
      getDateCreated: () => new FakeDate(a().creado),
      isTrashed: () => a().papelera,
      setTrashed: t => { S.cuentas.drive++; a().papelera = t; },
      moveTo: carpeta => { S.cuentas.drive++; a().carpeta = carpeta.getId(); },
      getBlob: () => ({
        getDataAsString: () => Buffer.from(a().bytes).toString('utf8'),
        getContentType: () => a().mime,
        getBytes: () => Array.from(a().bytes),
        getName: () => a().nombre
      })
    };
  }
  function apiCarpeta(id) {
    const c = () => S.carpetas[id];
    const lista = () => Object.values(S.archivos).filter(f => f.carpeta === id && !f.papelera).sort((x, y) => x.creado - y.creado || x.orden - y.orden);
    const iter = l => { let i = 0; return { hasNext: () => i < l.length, next: () => apiArchivo(l[i++].id) }; };
    return {
      getId: () => id,
      getUrl: () => 'https://drive.google.com/drive/folders/' + id,
      getName: () => c().nombre,
      isTrashed: () => c().papelera,
      createFile: (a, b, mime) => {
        S.cuentas.drive++;
        const fid = nuevoId('archivo');
        const f = typeof a === 'string'
          ? { id: fid, nombre: a, bytes: Buffer.from(String(b), 'utf8'), mime: mime || 'text/plain' }
          : { id: fid, nombre: a.nombre, bytes: Buffer.from(a.bytes), mime: a.mime };
        f.carpeta = id; f.papelera = false; f.creado = S.reloj; f.orden = nid;
        S.archivos[fid] = f;
        return apiArchivo(fid);
      },
      getFiles: () => { S.cuentas.drive++; return iter(lista()); },
      getFilesByName: n => { S.cuentas.drive++; return iter(lista().filter(f => f.nombre === n)); }
    };
  }
  const DriveApp = {
    createFolder: nombre => { const id = nuevoId('carpeta'); S.carpetas[id] = { nombre, papelera: false }; return apiCarpeta(id); },
    getFolderById: id => { S.cuentas.drive++; if (!id || !S.carpetas[id]) throw new Error('No item with the given ID could be found.'); return apiCarpeta(id); },
    getFileById: id => { S.cuentas.drive++; if (!S.archivos[id] || S.archivos[id].papelera) throw new Error('No item with the given ID could be found.'); return apiArchivo(id); }
  };

  // ---------- Servicios ----------
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (S.props[k] === undefined ? null : S.props[k]),
      setProperty: (k, v) => { S.props[k] = String(v); },
      setProperties: o => { Object.keys(o).forEach(k => { S.props[k] = String(o[k]); }); },
      getProperties: () => Object.assign({}, S.props),
      deleteProperty: k => { delete S.props[k]; }
    })
  };
  const CacheService = { getScriptCache: () => ({ get: k => (k in S.cache ? S.cache[k] : null), put: (k, v) => { S.cache[k] = String(v); }, remove: k => { delete S.cache[k]; } }) };
  const LockService = { getScriptLock: () => { let mio = false; return { tryLock: () => { if (S.locked) return false; S.locked = true; mio = true; return true; }, releaseLock: () => { if (mio) { S.locked = false; mio = false; } } }; } };
  const ScriptApp = {
    getProjectTriggers: () => S.triggers.slice(),
    deleteTrigger: t => { S.triggers = S.triggers.filter(x => x !== t); },
    newTrigger: fn => ({ timeBased: () => ({ everyMinutes: m => ({ create: () => { const t = { getHandlerFunction: () => fn, cadaMin: m }; S.triggers.push(t); return t; } }) }) })
  };
  const dv = () => { const o = { requireValueInList: () => o, requireCheckbox: () => o, setAllowInvalid: () => o, build: () => ({ tipo: 'validacion' }) }; return o; };
  const SpreadsheetApp = { openById: () => { S.cuentas.sheet++; return ss; }, newDataValidation: dv };
  const respuestaHttp = (code, txt) => ({ getResponseCode: () => code, getContentText: () => (typeof txt === 'string' ? txt : JSON.stringify(txt)) });
  const UrlFetchApp = {
    // fetchAll manda todo en paralelo: la demora (S.demora, en ms) se cuenta una vez por tanda.
    fetchAll: reqs => {
      const inicio = S.reloj;
      const out = reqs.map(q => {
        S.llamadas.push({ url: q.url, cuerpo: JSON.parse(q.payload || '{}'), momento: inicio });
        if (!S.gemini) throw new Error('prueba sin Gemini configurado');
        const r = S.gemini(q, S);
        if (r === 'EXCEPCION') throw new Error('Address unavailable');
        return respuestaHttp(r[0], r[1]);
      });
      S.reloj = Math.max(S.reloj, inicio + (S.demora || 0));
      return out;
    },
    fetch: (url, o) => {
      if (/generativelanguage/.test(url)) return UrlFetchApp.fetchAll([Object.assign({ url }, o)])[0];
      const r = S.fetchUrl ? S.fetchUrl(url, o) : [404, 'no'];
      return respuestaHttp(r[0], r[1]);
    }
  };
  const Utilities = {
    base64Encode: b => Buffer.from(b).toString('base64'),
    base64Decode: s => { if (!/^[A-Za-z0-9+/=\s]*$/.test(s)) throw new Error('Could not decode string.'); return Array.from(Buffer.from(s, 'base64')); },
    newBlob: (bytes, mime, nombre) => ({ bytes, mime, nombre }),
    getUuid: () => require('crypto').randomUUID(),
    formatDate: (d, tz, f) => new RealDate(d.getTime()).toISOString().replace('T', ' ').slice(0, 19).replace(/:/g, '.')
  };
  const ContentService = { createTextOutput: t => ({ setMimeType: m => ({ contenido: t, mime: m }) }), MimeType: { JSON: 'json', JAVASCRIPT: 'js' } };

  const g = {
    console, JSON, Math, Number, String, Object, Array, RegExp, Error, Boolean, isNaN, parseInt, parseFloat, Buffer,
    Date: FakeDate,
    SpreadsheetApp, DriveApp, PropertiesService, CacheService, LockService, ScriptApp, UrlFetchApp, Utilities, ContentService,
    Session: { getScriptTimeZone: () => 'America/Bogota' },
    Logger: { log: m => S.logs.push(String(m)) }
  };
  vm.createContext(g);
  let codigo = fs.readFileSync(RUTA_CODIGO, 'utf8').replace("'PEGUE_AQUI_EL_ID_DE_SU_HOJA'", "'hoja-de-prueba'");
  vm.runInContext(codigo + '\n;this.__COLUMNAS = COLUMNAS; this.__INAUDIBLE = INAUDIBLE; this.__limpiarCache = () => { HOJA_CACHE_ = null; };', g);

  // ---------- Ayudas para las pruebas ----------
  const api = {
    S, g, ss, libro,
    COLUMNAS: Array.from(g.__COLUMNAS),
    adelantar: ms => { S.reloj += ms; },
    hoja: () => ss.getSheetByName('Voces'),
    filas: () => {
      const sh = ss.getSheetByName('Voces'); const d = sh._h.datos; const cab = d[0] || [];
      return d.slice(1).filter(f => f && f.some(v => v !== '' && v !== undefined)).map(f => { const o = {}; cab.forEach((c, i) => { o[c] = f[i] === undefined ? '' : f[i]; }); return o; });
    },
    enviar: (datos) => {
      const r = g.doPost({ postData: { contents: typeof datos === 'string' ? datos : JSON.stringify(datos) } });
      return JSON.parse(r.contenido);
    },
    get: params => {
      const r = g.doGet({ parameter: params });
      return r.contenido;
    },
    archivosEn: carpetaId => Object.values(S.archivos).filter(f => f.carpeta === carpetaId && !f.papelera),
    configurar: () => { g.configurar(); g.__limpiarCache(); }
  };
  return api;
}

// ---------- Respuestas de Gemini ----------
const ok = texto => [200, { candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }] }];
const vacia = razon => [200, { candidates: [{ finishReason: razon || 'SAFETY' }] }];
const error = (code, status, message) => [code, { error: { code, status, message } }];

/** Lee de una petición de clasificación las respuestas que trae (en orden). */
function respuestasDelPrompt(q) {
  const cuerpo = typeof q.payload === 'string' ? JSON.parse(q.payload) : q.cuerpo;
  const txt = cuerpo.contents[0].parts[0].text || '';
  const partes = txt.split('RESPUESTAS:\n')[1] || '';
  return [...partes.matchAll(/Respuesta: «([\s\S]*?)»/g)].map(m => m[1]);
}
const esAudio = q => { const c = JSON.parse(q.payload); return !!(c.contents[0].parts[1] && c.contents[0].parts[1].inline_data); };

/** Clasificador falso: decide la palanca por una palabra del texto, y lo devuelve en JSON. */
function clasificadorFalso(opciones) {
  opciones = opciones || {};
  return q => {
    const rs = respuestasDelPrompt(q);
    if (opciones.veneno && rs.some(t => t.indexOf(opciones.veneno) >= 0)) return vacia('SAFETY');
    const salida = rs.map((t, i) => ({
      n: i + 1,
      palanca: /riego|agua|dique/i.test(t) ? 'agua' : /energ/i.test(t) ? 'energia' : /tr[aá]mite/i.test(t) ? 'reglas' : 'instituciones',
      palanca_secundaria: 'ninguna', sector: 'agro', resumen: 'Resumen de: ' + t.slice(0, 30), confianza: 'alta', palabras: ['agua', 'riego']
    }));
    return ok(JSON.stringify(salida));
  };
}

module.exports = { crearEntorno, ok, vacia, error, respuestasDelPrompt, esAudio, clasificadorFalso };
