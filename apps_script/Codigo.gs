/**
 * La voz de la Junta — backend v2 (Junta de Juntas, PND 2026-2030)
 *
 * Qué cambió frente a la v1, y por qué:
 *  1. El formulario ya no toca la hoja ni toma candados. Guarda el audio y una ficha
 *     en Drive y responde de una. Con 200 personas enviando a la vez, nadie hace fila.
 *  2. Las llamadas a Gemini van en paralelo (UrlFetchApp.fetchAll), no una por una.
 *  3. Dos etapas independientes, cada una con su propia clave (proyectos distintos):
 *       Etapa 1  audio  -> texto      GEMINI_API_KEY
 *       Etapa 2  texto  -> palanca    GEMINI_API_KEY_2, de a 20 respuestas por llamada
 *  4. La hoja se escribe por columnas completas, no celda por celda.
 *  5. (23 sep) La clasificacion usa el mapa de terminos por palanca derivado del
 *     Resumen ejecutivo PND Cartagena-Bolivar v6: cada palanca lleva su definicion
 *     larga y su vocabulario, hay reglas de desempate para las confusiones frecuentes
 *     (sector vs. palanca, agua vs. clima, empleo vs. formacion, reglas vs. brechas),
 *     ocho ejemplos resueltos, y una pista deterministica por palabras clave que se
 *     le pasa a la IA como apoyo — no como respuesta.
 *  6. (24 sep) Candado real (LockService); resultados escritos por id y no por posición;
 *     la saturación de Gemini no gasta intentos; un audio dañado o una respuesta ilegible
 *     de la IA solo afectan a su fila; textos que empiezan por = no se vuelven fórmulas.
 *
 * Montaje: ver README.md. Antes del evento ejecute verificarClaves().
 */

// ---------- Configuración ----------
const HOJA = 'Voces';
const SHEET_ID = 'PEGUE_AQUI_EL_ID_DE_SU_HOJA';

const CLAVE_AUDIO = 'GEMINI_API_KEY';    // proyecto 1: transcripción
const CLAVE_TEXTO = 'GEMINI_API_KEY_2';  // proyecto 2: clasificación

const MODELOS_AUDIO = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
const MODELOS_TEXTO = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];

const LOTE_AUDIO = 25;   // transcripciones en paralelo por tanda
const LOTE_TEXTO = 20;   // respuestas clasificadas en una sola llamada
const SEG_MAX = 260;     // segundos de trabajo por ejecución (el tope de Apps Script son 360)
const MAX_INTENTOS = 8;  // fallas REALES (audio ilegible, respuesta vacía o inválida) antes de marcar error
// Gemini saturado (429, 5xx) o un modelo que no existe no es culpa de la respuesta: no gasta
// intentos. Solo si una misma respuesta lleva TOPE_TRANSITORIOS minutos seguidos fallando así,
// se cuenta un intento, para que una respuesta que siempre falla no quede en cola para siempre.
const CODIGOS_TRANSITORIOS = [403, 404, 408, 429, 500, 502, 503, 504];
const TOPE_TRANSITORIOS = 10;

const PARTES = ['vision', 'compromiso'];
const CAMPOS_PARTE = ['escrita', 'audio_url', 'audio_id', 'transcripcion', 'palanca', 'palanca_2', 'sector', 'resumen', 'confianza', 'palanca_validada'];
const COLUMNAS = ['id', 'recibido', 'nombre', 'organizacion', 'rol']
  .concat(...PARTES.map(p => CAMPOS_PARTE.map(c => p + '_' + c)))
  .concat(['estado_ia', 'intentos', 'ocultar', 'estado', 'notas_equipo', 'consentimiento'])
  .concat(PARTES.map(p => p + '_palabras'));  // al final, para no mover las columnas existentes

const PALANCAS = {
  conectividad: 'Conectividad que mueve la produccion y acerca a la gente. Infraestructura y servicios que reducen tiempos y costos de mover carga, personas y datos: aeropuerto Rafael Nunez y Ciudadela Aeroportuaria de Bayunca, aeropuertos regionales, tren regional, doble calzada Cartagena-Barranquilla, corredor de carga Cartagena-Mamonal, vias, acceso al puerto, dragado y canal de acceso, y conectividad digital.',
  energia: 'Energia confiable para la casa y la industria. Precio, calidad y disponibilidad del servicio electrico y del gas: tarifas, tarifa diferencial, apagones y perdidas, deuda estatal con las comercializadoras, regimen estructural para la Costa Caribe, gas costa afuera, regasificacion, renovables, almacenamiento y conexion a la red.',
  agua: 'Agua que llega a los hogares y riega el campo. Agua potable, acueducto y saneamiento, y agua para producir: Canal del Dique, distrito de riego de Maria la Baja, navegabilidad, control de inundaciones, Bahia de Cartagena, central de abastos y reconversion agroindustrial.',
  clima: 'Territorio que se anticipa al clima. Adaptacion y gestion del riesgo climatico: erosion costera, aumento del nivel del mar, sequias, olas de calor, ecosistemas y manglares, emisiones y descarbonizacion, economia circular y residuos. Es una palanca transversal, todavia en construccion.',
  reglas: 'Reglas claras para abrir, operar y formalizarse. El entorno normativo del negocio: informalidad empresarial (tres de cada cuatro establecimientos de Cartagena), regimen de formalizacion progresiva, matricula y registro mercantil, cargas tributarias simplificadas, tramites y tiempos de respuesta, Ventanilla Unica Empresarial e interoperabilidad, licencias y permisos, normas expedidas pero sin reglamentar.',
  credito: 'Credito que llega y produce. Acceso al financiamiento productivo: garantias, fondos, tasas, capital de trabajo, banca de desarrollo, instrumentos que existen pero no se usan (por ejemplo la hipoteca naval), y el acceso de la mipyme y del emprendimiento.',
  formacion: 'Formacion pertinente para el trabajo. Que la gente tenga las capacidades que el aparato productivo necesita: educacion tecnica y tecnologica, SENA y universidades, pertinencia de la oferta, bilinguismo, certificacion de competencias, practicas y formacion dual, talento para puerto, turismo e industria.',
  brechas: 'Cierre de brechas que activa el potencial productivo. Las condiciones sociales que habilitan o frenan la capacidad de producir: pobreza y desigualdad, barrios y periferia, ruralidad, empleo formal e ingresos, informalidad laboral, inclusion productiva de mujeres y jovenes, vivienda, seguridad alimentaria y calidad de vida.',
  instituciones: 'Instituciones regionales con respaldo de la Nacion. Capacidad de decidir, coordinar y ejecutar: articulacion Distrito-Gobernacion-Nacion, DNP y ministerios, RAP Caribe y Comision Regional de Competitividad, capacidad de ejecucion y de estructuracion de proyectos, CONPES, vigencias futuras y concurrencia de recursos, continuidad de la politica publica, transparencia y confianza.'
};

/**
 * Mapa de terminos por palanca, derivado del Resumen ejecutivo PND Cartagena-Bolivar (v6).
 * Sirve para dos cosas: se le entrega a la IA como vocabulario de cada palanca, y ademas
 * se usa aqui mismo para calcular una pista deterministica por respuesta (ver pistas_).
 * Se escriben sin tildes y en minuscula: la comparacion tambien normaliza el texto.
 */
const TERMINOS = {
  conectividad: ['via','vias','carretera','carreteras','corredor','corredores','doble calzada','ruta 90a','cantagallo','mamonal','troncal','tren','tren regional','ferrocarril','ferroviario','intermodal','intermodalidad','aeropuerto','aeropuertos','rafael nunez','bayunca','ciudadela aeroportuaria','magangue','mompox','santa rosa del sur','carmen de bolivar','aereo','aerea','pasajeros','vuelos','frecuencias','conectividad','acceso al puerto','canal de acceso','dragado','draga','calado','muelle','cabotaje','logistica','logistico','carga','transporte','movilidad','trafico','congestion','tiempos de viaje','ultima milla','ani','fdn','conectividad digital','internet','banda ancha','fibra optica','cobertura movil','telecomunicaciones','5g','conexion a internet'],
  energia: ['energia','energetico','energetica','electricidad','electrico','luz','apagon','apagones','tarifa','tarifas','tarifa diferencial','costo de la energia','servicio de energia','confiabilidad','calidad del servicio','perdidas','subsidio','subsidios','afinia','electricaribe','comercializadora','comercializadoras','deuda estatal','regimen costa caribe','caribe energetico','gas','gas natural','gas costa afuera','regasificacion','almacenamiento','baterias','renovable','renovables','solar','fotovoltaica','eolica','eolico','autogeneracion','generacion','red electrica','conexion al sistema','capacidad atrapada','contratacion de largo plazo','transicion energetica','matriz energetica','upme','creg','xm'],
  agua: ['agua','agua potable','acueducto','alcantarillado','saneamiento','saneamiento basico','potabilizacion','vertimientos','riego','distrito de riego','maria la baja','canal del dique','dique','ecoregion','bahia de cartagena','sedimentacion','navegabilidad','inundacion','inundaciones','control de inundaciones','cienaga','rio magdalena','hectareas','agua para producir','reconversion agroindustrial','central de abastos','centros de transformacion','abastecimiento de agua','sequia del acueducto','app 5g'],
  clima: ['clima','climatico','cambio climatico','adaptacion','mitigacion','resiliencia','gestion del riesgo','riesgo climatico','erosion','erosion costera','playas','nivel del mar','marea','mar de leva','huracan','sequia','ola de calor','emisiones','carbono','descarbonizacion','huella de carbono','sostenibilidad ambiental','ambiental','ecosistema','ecosistemas','manglar','manglares','biodiversidad','economia circular','residuos','basuras','plasticos','ley 2232','transicion justa','reforestacion','conservacion'],
  reglas: ['formalizacion','formalidad','informalidad empresarial','formalizarse','matricula mercantil','registro mercantil','renovacion del registro','camara de comercio','tramite','tramites','ventanilla unica','interoperabilidad','licencia','licencias','permiso','permisos','regulacion','reglamentacion','sin reglamentar','decreto','decretos','norma','normas','normativa','articulado','zese','regimen especial','simplificacion','carga tributaria','cargas','impuesto','impuestos','ica','burocracia','papeleo','tiempos de respuesta','curaduria','pot','uso del suelo','seguridad juridica','estabilidad juridica','tramite aduanero','inspeccion','sobrecostos regulatorios','abrir una empresa','crear empresa','cerrar una empresa'],
  credito: ['credito','creditos','financiamiento','financiacion','financiero','garantia','garantias','fondo de garantias','fondo','fondos','banca','bancario','bancos','bancoldex','finagro','fng','tasa de interes','tasas','capital','capital de trabajo','capital semilla','liquidez','endeudamiento','acceso al credito','inversion productiva','mipyme','mipymes','pyme','pymes','microempresa','microempresas','emprendimiento','emprendedor','leasing','factoring','hipoteca naval','linea de credito','cupo de credito','fintech'],
  formacion: ['formacion','capacitacion','educacion tecnica','tecnico','tecnologo','tecnologica','sena','universidad','universidades','academia','pertinencia','curriculo','oferta educativa','bilinguismo','bilingue','ingles','idioma','idiomas','talento','talento humano','capital humano','habilidades','competencias','mano de obra','mano de obra calificada','certificacion','certificaciones','aprendiz','aprendices','practicas','formacion dual','reconversion laboral','vocacional','empleabilidad','doble titulacion','becas','cobertura educativa','calidad educativa','desercion','curso','cursos','perfil ocupacional'],
  brechas: ['brecha','brechas','pobreza','pobreza extrema','desigualdad','inclusion','inclusion social','inclusion productiva','vulnerable','vulnerabilidad','barrio','barrios','periferia','ruralidad','rural','zona rural','corregimientos','unidades comuneras','empleo formal','empleo','desempleo','trabajo decente','ingreso','ingresos','salario','informalidad laboral','mujer','mujeres','juventud','jovenes','primera infancia','nutricion','seguridad alimentaria','vivienda','habitat','salud','migracion','victimas','etnico','palenque','calidad de vida','tejido social','oportunidades','equidad'],
  instituciones: ['institucion','instituciones','institucional','institucionalidad','gobernanza','coordinacion','articulacion','distrito','alcaldia','gobernacion','nacion','gobierno nacional','dnp','ministerio','ministerios','rap caribe','region administrativa','comision regional','competitividad','capacidad institucional','capacidad de ejecucion','ejecucion','estructuracion de proyectos','gestion publica','planeacion','plan de desarrollo','conpes','vigencias futuras','cofinanciacion','concurrencia','presupuesto','regalias','ocad','catastro','veeduria','transparencia','corrupcion','confianza','contratacion publica','continuidad','politica publica','largo plazo','bancada','congreso','incidencia']
};

const SECTORES = {
  maritimo: 'Marítimo y astillero', energia: 'Energía', turismo: 'Turismo', industria: 'Industria', agro: 'Agro',
  comext: 'Comercio exterior y logística', desemp: 'Desarrollo empresarial', hogares: 'Hogares y social'
};
const PREGUNTAS = {
  vision: '¿qué visión tiene para Cartagena y Bolívar?',
  compromiso: '¿cuál es su compromiso concreto? (algo que su organización hará o aportará)'
};

// Nucleo curado de palabras de impacto, una por condicion del PND, no por sector.
// La IA prefiere estas; si alguien dice otra, se guarda igual y el panel la muestra
// solo cuando tres o mas personas la repiten. Van con tilde: el panel las cuenta sin tilde
// pero las proyecta tal como vienen.
const VOCABULARIO = [
  'vías','puerto','aeropuerto','tren','conectividad','logística','dragado','corredores','internet',
  'energía','tarifas','gas','renovables','apagones',
  'agua','acueducto','riego','dique','saneamiento',
  'clima','erosión','adaptación','manglares','residuos',
  'formalización','trámites','regulación','ventanilla','informalidad',
  'crédito','financiamiento','garantías','mipyme','emprendimiento',
  'formación','talento','bilingüismo','competencias','aprendices',
  'empleo','pobreza','inclusión','ruralidad','barrios','equidad',
  'instituciones','gobernanza','coordinación','ejecución','transparencia'
];

// ---------- Montaje ----------
function configurar() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if (ss.getName() !== 'La voz de la Junta') ss.rename('La voz de la Junta');
  let sh = ss.getSheetByName(HOJA);
  if (!sh) { sh = ss.insertSheet(HOJA); const h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1'); if (h1) ss.deleteSheet(h1); }
  sh.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CARPETA_ID')) props.setProperty('CARPETA_ID', DriveApp.createFolder('La voz de la Junta - audios').getId());
  if (!props.getProperty('BANDEJA_ID')) props.setProperty('BANDEJA_ID', DriveApp.createFolder('La voz de la Junta - bandeja').getId());
  if (!props.getProperty('PANEL_TOKEN')) props.setProperty('PANEL_TOKEN', Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  const col = n => COLUMNAS.indexOf(n) + 1;
  PARTES.forEach(p => sh.getRange(2, col(p + '_palanca_validada'), 2000, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(PALANCAS), true).build()));
  sh.getRange(2, col('ocultar'), 2000, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'procesarPendientes').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('procesarPendientes').timeBased().everyMinutes(1).create();
  Logger.log('Clave del panel: ' + props.getProperty('PANEL_TOKEN'));
  Logger.log('Audios: ' + DriveApp.getFolderById(props.getProperty('CARPETA_ID')).getUrl());
  Logger.log('Bandeja: ' + DriveApp.getFolderById(props.getProperty('BANDEJA_ID')).getUrl());
  if (!props.getProperty(CLAVE_AUDIO) || !props.getProperty(CLAVE_TEXTO)) Logger.log('FALTAN CLAVES: ' + CLAVE_AUDIO + ' y ' + CLAVE_TEXTO);
}

// ---------- Recepción: sin candado, sin tocar la hoja ----------
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!d.id || !d.nombre || !d.organizacion) return json_({ ok: false, error: 'faltan datos' });
    if (!/^[A-Za-z0-9-]{8,64}$/.test(String(d.id))) return json_({ ok: false, error: 'id inválido' });
    if (d.consentimiento !== true) return json_({ ok: false, error: 'sin autorización' });
    const props = PropertiesService.getScriptProperties();
    const carpeta = DriveApp.getFolderById(props.getProperty('CARPETA_ID'));
    const ficha = {
      id: String(d.id), nombre: corto_(d.nombre, 120),
      organizacion: corto_(d.organizacion, 160), rol: corto_(d.rol, 120)
    };
    PARTES.forEach(p => {
      const r = d[p] || {};
      ficha[p + '_escrita'] = corto_(r.texto, 3000);
      if (r.audio && r.audio.base64) {
        const mime = String(r.audio.mime || 'audio/webm').split(';')[0];
        const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';
        const nombre = [p, limpiar_(d.organizacion), limpiar_(d.nombre), String(d.id).slice(0, 8)].join('_') + '.' + ext;
        const archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(r.audio.base64), mime, nombre));
        ficha[p + '_audio_url'] = archivo.getUrl();
        ficha[p + '_audio_id'] = archivo.getId();
      }
    });
    DriveApp.getFolderById(props.getProperty('BANDEJA_ID'))
      .createFile(String(d.id) + '.json', JSON.stringify(ficha), 'application/json');
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---------- Proceso de cada minuto ----------
function procesarPendientes() {
  // Candado real: si la ejecución anterior sigue trabajando, esta no arranca.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const t0 = Date.now();
  // audio/texto: la etapa sigue activa en esta ejecución. fallaron: respuestas que ya
  // fallaron en esta ejecución; se reintentan en la siguiente, no en la misma vuelta.
  const estado = { audio: true, texto: true, fallaron: {} };
  try {
    ingresarFichas_();
    while ((Date.now() - t0) / 1000 < SEG_MAX) {
      const a = estado.audio ? transcribirTanda_(estado) : 0;
      const b = estado.texto ? clasificarTanda_(estado) : 0;
      if (!a && !b) break;
    }
    actualizarEstados_();
  } finally {
    lock.releaseLock();
  }
}

/** Pasa las fichas de la bandeja de Drive a filas de la hoja, todas de un golpe. */
function ingresarFichas_() {
  const bandeja = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('BANDEJA_ID'));
  const it = bandeja.getFiles();
  const fichas = [], archivos = [];
  while (it.hasNext() && archivos.length < 300) {
    const f = it.next();
    archivos.push(f);
    try { fichas.push(JSON.parse(f.getBlob().getDataAsString())); } catch (x) {}
  }
  if (!archivos.length) return 0;
  const sh = hoja_();
  const ultima = sh.getLastRow();
  const vistos = {};
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, 1).getValues().forEach(r => { if (r[0]) vistos[String(r[0])] = 1; });
  const filas = [];
  fichas.forEach(n => {
    if (!n || !n.id || vistos[String(n.id)]) return;
    vistos[String(n.id)] = 1;
    const o = { id: n.id, recibido: new Date(), nombre: n.nombre, organizacion: n.organizacion, rol: n.rol,
      estado_ia: 'pendiente', intentos: 0, ocultar: false, estado: 'sin verificar', consentimiento: 'sí' };
    PARTES.forEach(p => CAMPOS_PARTE.forEach(c => {
      if (n[p + '_' + c] !== undefined) o[p + '_' + c] = n[p + '_' + c];
    }));
    filas.push(COLUMNAS.map(c => o[c] === undefined ? '' : seguro_(o[c])));
  });
  if (filas.length) sh.getRange(sh.getLastRow() + 1, 1, filas.length, COLUMNAS.length).setValues(filas);
  archivos.forEach(f => { try { f.setTrashed(true); } catch (x) {} });
  return filas.length;
}

/** Etapa 1: audio -> texto, hasta LOTE_AUDIO notas de voz en paralelo. */
function transcribirTanda_(estado) {
  const sh = hoja_();
  const datos = sh.getDataRange().getValues();
  if (datos.length < 2) return 0;
  const cab = datos[0], c = n => cab.indexOf(n);
  const jobs = [];
  for (let r = 1; r < datos.length && jobs.length < LOTE_AUDIO; r++) {
    const f = datos[r];
    if (!f[c('id')]) continue;
    if (String(f[c('estado_ia')]).indexOf('error') === 0) continue;
    if (Number(f[c('intentos')]) >= MAX_INTENTOS) continue;
    for (const p of PARTES) {
      if (jobs.length >= LOTE_AUDIO) break;
      const id = String(f[c('id')]), k = id + ':' + p;
      if (estado.fallaron[k]) continue;
      if (f[c(p + '_audio_id')] && !f[c(p + '_transcripcion')]) jobs.push({ id: id, p: p, k: k, archivo: f[c(p + '_audio_id')] });
    }
  }
  if (!jobs.length) return 0;

  const clave = PropertiesService.getScriptProperties().getProperty(CLAVE_AUDIO);
  if (!clave) throw new Error('falta ' + CLAVE_AUDIO);
  const listos = [];
  jobs.forEach(j => {
    // Un audio borrado o dañado solo afecta a su respuesta, no detiene la tanda.
    try {
      const blob = DriveApp.getFileById(j.archivo).getBlob();
      let mime = blob.getContentType() || 'audio/webm';
      if (/mp4|m4a/.test(mime)) mime = 'audio/mp4';
      j.cuerpo = {
        contents: [{ role: 'user', parts: [
          { text: 'Transcribe literalmente esta nota de voz, en español de Colombia, con puntuación. No resumas, no corrijas, no agregues nada. Quita solo las muletillas repetidas. Responde únicamente con la transcripción.' },
          { inline_data: { mime_type: mime, data: Utilities.base64Encode(blob.getBytes()) } }
        ] }],
        generationConfig: { temperature: 0 }
      };
      listos.push(j);
    } catch (err) {
      j.real = true;
    }
  });

  if (listos.length) enParalelo_(listos, MODELOS_AUDIO, clave, 'AUDIO');
  const cambios = [], hechos = jobs.filter(j => j.texto);
  hechos.forEach(j => cambios.push({ id: j.id, campo: j.p + '_transcripcion', valor: j.texto }));
  const fallas = jobs.filter(j => !j.texto);
  fallas.forEach(j => { estado.fallaron[j.k] = 1; });
  const transitorias = fallas.filter(j => !j.real);
  if (transitorias.length && !hechos.length) estado.audio = false;  // Gemini saturado: esperar al siguiente minuto
  const aContar = fallas.filter(j => j.real).map(j => j.id).concat(contarTransitorias_(transitorias));
  aplicarPorId_(sh, cambios, aContar);
  return hechos.length;
}

/** Etapa 2: texto -> palanca, sector, resumen y palabras. Hasta LOTE_TEXTO en UNA sola llamada. */
function clasificarTanda_(estado) {
  const sh = hoja_();
  const datos = sh.getDataRange().getValues();
  if (datos.length < 2) return 0;
  const cab = datos[0], c = n => cab.indexOf(n);
  const items = [];
  for (let r = 1; r < datos.length && items.length < LOTE_TEXTO; r++) {
    const f = datos[r];
    if (!f[c('id')]) continue;
    if (String(f[c('estado_ia')]).indexOf('error') === 0) continue;
    if (Number(f[c('intentos')]) >= MAX_INTENTOS) continue;
    for (const p of PARTES) {
      if (items.length >= LOTE_TEXTO) break;
      if (f[c(p + '_palanca')]) continue;
      const texto = f[c(p + '_transcripcion')] || f[c(p + '_escrita')] || '';
      if (!texto) continue;
      if (f[c(p + '_audio_id')] && !f[c(p + '_transcripcion')]) continue; // espera a que se transcriba
      const id = String(f[c('id')]), k = id + ':' + p;
      if (estado.fallaron[k]) continue;
      items.push({ id: id, p: p, k: k, texto: String(texto) });
    }
  }
  if (!items.length) return 0;

  const clave = PropertiesService.getScriptProperties().getProperty(CLAVE_TEXTO);
  if (!clave) throw new Error('falta ' + CLAVE_TEXTO);
  const job = {
    cuerpo: {
      contents: [{ role: 'user', parts: [{ text: instruccionesLote_(items) }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              n: { type: 'INTEGER' },
              palanca: { type: 'STRING', enum: Object.keys(PALANCAS) },
              palanca_secundaria: { type: 'STRING', enum: Object.keys(PALANCAS).concat(['ninguna']) },
              sector: { type: 'STRING', enum: Object.keys(SECTORES) },
              resumen: { type: 'STRING' },
              confianza: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
              palabras: { type: 'ARRAY', items: { type: 'STRING' } }
            },
            required: ['n', 'palanca', 'sector', 'resumen', 'confianza', 'palabras']
          }
        }
      }
    }
  };

  enParalelo_([job], MODELOS_TEXTO, clave, 'TEXTO');
  items.forEach(it => { estado.fallaron[it.k] = 1; });  // se desmarcan abajo las que salgan bien
  if (!job.texto) {
    if (job.real) { aplicarPorId_(sh, [], items.map(it => it.id)); return 0; }
    estado.texto = false;  // Gemini saturado: esperar al siguiente minuto
    aplicarPorId_(sh, [], contarTransitorias_(items));
    return 0;
  }
  let salida;
  try { salida = JSON.parse(job.texto); } catch (x) { salida = []; }
  if (!Array.isArray(salida)) salida = [];
  const cambios = [], hechos = {};
  salida.forEach(o => {
    const it = items[Number(o.n) - 1];
    if (!it || hechos[it.k] || !PALANCAS[o.palanca]) return;
    hechos[it.k] = 1;
    delete estado.fallaron[it.k];
    const seg = (o.palanca_secundaria === 'ninguna' || o.palanca_secundaria === o.palanca) ? '' : (o.palanca_secundaria || '');
    const pares = [['palanca', o.palanca], ['palanca_2', seg], ['sector', o.sector || ''],
      ['resumen', o.resumen || ''], ['confianza', o.confianza || ''],
      ['palabras', (o.palabras || []).slice(0, 3).join(', ')]];
    pares.forEach(par => cambios.push({ id: it.id, campo: it.p + '_' + par[0], valor: par[1] }));
  });
  // JSON inválido o respuestas que la IA dejó por fuera: cuentan un intento y se reintentan
  // en la siguiente ejecución, no en un bucle dentro de esta.
  const faltan = items.filter(it => !hechos[it.k]);
  aplicarPorId_(sh, cambios, faltan.map(it => it.id));
  return Object.keys(hechos).length;
}

/** Texto en minuscula y sin tildes, para comparar contra TERMINOS. */
function normal_(t) {
  return String(t || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pista deterministica: cuenta cuantos terminos de cada palanca aparecen en el texto.
 * No decide nada — se le pasa a la IA como señal de apoyo, porque un termino suelto
 * ("puerto", "empleo") puede pertenecer a mas de una palanca segun el contexto.
 * Devuelve '' si no hay señal clara.
 */
function pistas_(texto) {
  const t = ' ' + normal_(texto) + ' ';
  if (t.length < 12) return '';
  const puntos = [];
  Object.keys(TERMINOS).forEach(pal => {
    let n = 0;
    TERMINOS[pal].forEach(term => {
      const x = ' ' + term + ' ';
      if (t.indexOf(x) >= 0 || t.indexOf(' ' + term + 's ') >= 0) n += (term.indexOf(' ') > 0 ? 2 : 1);
    });
    if (n) puntos.push([pal, n]);
  });
  if (!puntos.length) return '';
  puntos.sort(function (a, b) { return b[1] - a[1]; });
  return puntos.slice(0, 3).map(function (x) { return x[0]; }).join(', ');
}

/** Las reglas que resuelven las confusiones que mas se han visto en las pruebas. */
const DESEMPATES = [
  'Un SECTOR no es una palanca. "turismo", "puerto", "industria", "agro", "comercio exterior", "maritimo" nombran el sector, no la palanca. La palanca es la CONDICION que esa persona quiere mover para que ese sector funcione. Si solo nombra el sector o una aspiracion general, escoge la condicion que esa aspiracion necesita primero y marca la confianza como baja.',
  'Puerto: si habla de acceso, dragado, canal, corredor de carga o tiempos, es conectividad. Si habla de tramites, aduana, inspecciones o normas sin reglamentar, es reglas. El puerto en si es el sector, no la palanca.',
  'Agua: si es acueducto, riego, Canal del Dique o navegabilidad, es agua — aunque hable del campo. Si es erosion costera, nivel del mar, sequias o adaptacion, es clima.',
  'Energia: renovables, gas, tarifas y confiabilidad son energia, no clima. Solo es clima cuando el punto es la adaptacion, las emisiones o los ecosistemas.',
  'Informalidad: si es de empresas (matricula, registro, tramites, cargas), es reglas. Si es de personas y sus ingresos, es brechas.',
  'Empleo: si el punto es generar empleo formal y cerrar brechas de ingreso, es brechas. Si el punto es que la gente tenga las capacidades o la formacion para ese empleo, es formacion.',
  'Educacion: si es formar para el trabajo o pertinencia de la oferta, es formacion. Si es cobertura, desercion o desigualdad educativa como brecha social, es brechas.',
  'Plata: si es financiamiento para que una empresa produzca (credito, garantias, tasas, fondos), es credito. Si es presupuesto publico, regalias, vigencias futuras o concurrencia de la Nacion, es instituciones.',
  'Si la persona pide coordinacion, articulacion, ejecucion, continuidad o respaldo del Gobierno Nacional sin nombrar el tema concreto, es instituciones.'
];

const EJEMPLOS = [
  ['Que Cartagena sea una potencia turistica de talla mundial.', 'conectividad', 'turismo', 'Nombra el sector turismo pero ninguna condicion; la condicion que primero necesita es la conectividad que trae al visitante. Confianza baja.'],
  ['Necesitamos que el puerto tenga calado suficiente y que la carga salga rapido de Mamonal.', 'conectividad', 'comext', 'Dragado y corredor de carga: es conectividad, no el sector portuario.'],
  ['La tarifa de energia nos esta sacando del mercado; la industria no aguanta ese costo.', 'energia', 'industria', 'Precio y confiabilidad del servicio.'],
  ['Sin riego, el agro de Maria la Baja no se puede reconvertir.', 'agua', 'agro', 'Agua para producir, aunque hable del campo.'],
  ['Abrir una empresa aqui toma meses entre tramites y permisos.', 'reglas', 'desemp', 'Entorno normativo del negocio.'],
  ['Nos comprometemos a formar cien jovenes bilingues para el sector hotelero.', 'formacion', 'turismo', 'Capacidades de la gente para el trabajo.'],
  ['Que los barrios de la periferia tengan empleo formal y no vivan del rebusque.', 'brechas', 'hogares', 'Pobreza, informalidad laboral e ingresos.'],
  ['Que el Distrito, la Gobernacion y la Nacion por fin ejecuten lo que firman.', 'instituciones', 'desemp', 'Coordinacion y capacidad de ejecucion.']
];

function instruccionesLote_(items) {
  const lista = items.map(function (it, i) {
    const pis = pistas_(it.texto);
    return (i + 1) + '. Pregunta: ' + PREGUNTAS[it.p] +
      '\n   Respuesta: «' + it.texto.slice(0, 1200) + '»' +
      (pis ? '\n   (señales por palabras clave, solo de apoyo: ' + pis + ')' : '');
  }).join('\n');

  const vocabPal = Object.keys(TERMINOS).map(function (k) {
    return '  ' + k + ' — ' + PALANCAS[k] + '\n    Terminos: ' + TERMINOS[k].join(', ');
  }).join('\n');

  const ejem = EJEMPLOS.map(function (e, i) {
    return '  ' + (i + 1) + '. «' + e[0] + '» -> palanca: ' + e[1] + ' · sector: ' + e[2] + ' · por que: ' + e[3];
  }).join('\n');

  return [
    'Eres analista del sistema de inteligencia territorial de la Camara de Comercio de Cartagena para el Plan Nacional de Desarrollo 2026-2030.',
    'Abajo hay ' + items.length + ' respuestas de asistentes a la Junta de Juntas. Clasifica CADA UNA por separado.',
    '',
    'QUE ES UNA PALANCA. Una palanca es una CONDICION del territorio que, al modificarse, mejora el desempeño de mas de un sector. No es una obra, ni un diagnostico, ni un resultado, ni un sector economico. Son nueve, en tres familias: lo que el territorio pone (conectividad, energia, agua, clima), lo que mueve a las empresas (reglas, credito, formacion) y lo que sostiene a la gente (brechas, instituciones).',
    '',
    'LAS NUEVE PALANCAS Y SU VOCABULARIO:',
    vocabPal,
    '',
    'COMO DESEMPATAR:',
    DESEMPATES.map(function (r, i) { return '  ' + (i + 1) + '. ' + r; }).join('\n'),
    '',
    'EJEMPLOS RESUELTOS:',
    ejem,
    '',
    'Para cada respuesta devuelve:',
    '- n: el numero de la respuesta, tal como aparece en la lista.',
    '- palanca: SIEMPRE una. La condicion que mas moveria lo que la persona dijo. Lee la respuesta completa y decide por el sentido, no por una palabra suelta: las señales de palabras clave son apoyo, no la respuesta. Nunca la dejes vacia; si la respuesta es muy general, escoge la mas cercana y marca la confianza como "baja".',
    '- palanca_secundaria: otra palanca que tambien toca claramente, o "ninguna". Si la respuesta menciona dos condiciones, la principal es la que la persona pone como causa y la secundaria la que pone como consecuencia.',
    '- sector: la actividad economica desde la que habla. ' + Object.keys(SECTORES).map(function (k) { return k + ' = ' + SECTORES[k]; }).join(' | ') + '. Si habla como ciudadano o de la gente en general, usa hogares.',
    '- resumen: una frase de maximo 20 palabras, en tercera persona y sin adornos.',
    '- confianza: alta si la palanca es evidente; media si hay dos opciones razonables; baja si la respuesta es ambigua, muy general o solo nombra un sector.',
    '- palabras: de una a tres palabras de impacto. Escoge SIEMPRE que puedas de esta lista: ' + VOCABULARIO.join(', ') + '. Si lo que dijo la persona de verdad no encaja en ninguna, usa una palabra propia: un sustantivo comun en singular y en minuscula, escrito con sus tildes. Nunca uses articulos, preposiciones, conectores, verbos, nombres propios, nombres de sectores ni palabras de menos de cuatro letras.',
    '',
    'No inventes nada que la persona no haya dicho. Devuelve un objeto por cada una de las ' + items.length + ' respuestas.',
    '',
    'RESPUESTAS:',
    lista
  ].join('\n');
}

/**
 * Lanza todas las llamadas de una tanda a la vez y reintenta con el siguiente modelo las que se saturen.
 * Cada job que sale bien queda con j.texto. Los que fallan quedan con j.real = true si alguna
 * falla fue culpa de la respuesta misma (400, respuesta vacía o ilegible); si todas fueron
 * saturación o configuración (CODIGOS_TRANSITORIOS), j.real queda sin marcar.
 */
function enParalelo_(jobs, modelos, clave, tipo) {
  let quedan = jobs.slice();
  const props = PropertiesService.getScriptProperties();
  const preferido = props.getProperty('MODELO_' + tipo);
  const orden = preferido ? [preferido].concat(modelos.filter(m => m !== preferido)) : modelos.slice();
  for (const modelo of orden) {
    if (!quedan.length) break;
    const peticiones = quedan.map(j => ({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent',
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': clave }, payload: JSON.stringify(j.cuerpo)
    }));
    let respuestas;
    try { respuestas = UrlFetchApp.fetchAll(peticiones); } catch (err) { continue; }
    const siguen = [];
    respuestas.forEach((resp, i) => {
      const j = quedan[i], code = resp.getResponseCode();
      if (code !== 200) {
        if (CODIGOS_TRANSITORIOS.indexOf(code) < 0) j.real = true;
        siguen.push(j);
        return;
      }
      try {
        const cand = ((JSON.parse(resp.getContentText()).candidates || [])[0] || {}).content || { parts: [] };
        const txt = (cand.parts || []).map(x => x.text || '').join('').trim();
        if (txt) { j.texto = txt; } else { j.real = true; siguen.push(j); }
      } catch (x) { j.real = true; siguen.push(j); }
    });
    if (siguen.length < quedan.length) props.setProperty('MODELO_' + tipo, modelo);
    quedan = siguen;
  }
  return quedan;
}

/**
 * Cuenta las fallas por saturación de cada respuesta entre ejecuciones. Devuelve los ids
 * de las filas que ya llevan TOPE_TRANSITORIOS seguidas: esas sí gastan un intento.
 */
function contarTransitorias_(lista) {
  const cache = CacheService.getScriptCache();
  const ids = [];
  lista.forEach(j => {
    const k = 'tr_' + j.k;
    const n = Number(cache.get(k) || 0) + 1;
    if (n >= TOPE_TRANSITORIOS) { ids.push(j.id); cache.remove(k); }
    else cache.put(k, String(n), 21600);
  });
  return ids;
}

/**
 * Aplica los resultados buscando cada fila por su id, sobre una lectura fresca de la hoja.
 * Así, si alguien ordena la hoja o borra una fila mientras Gemini responde, cada resultado
 * cae en su fila y no en la que estaba en esa posición antes.
 * cambios: [{id, campo, valor}]. idsIntento: filas que suman un intento (una vez por fila).
 */
function aplicarPorId_(sh, cambios, idsIntento) {
  if (!cambios.length && !idsIntento.length) return;
  const datos = sh.getDataRange().getValues();
  const cab = datos[0], ci = cab.indexOf('id'), kn = cab.indexOf('intentos');
  const fila = {};
  for (let r = 1; r < datos.length; r++) if (datos[r][ci]) fila[String(datos[r][ci])] = r;
  const cols = {};
  cambios.forEach(x => {
    const r = fila[x.id], k = cab.indexOf(x.campo);
    if (r === undefined || k < 0) return;
    datos[r][k] = x.valor;
    cols[x.campo] = 1;
  });
  const sumados = {};
  idsIntento.forEach(id => {
    const r = fila[id];
    if (r === undefined || sumados[id]) return;
    sumados[id] = 1;
    datos[r][kn] = Number(datos[r][kn] || 0) + 1;
    cols.intentos = 1;
  });
  escribirColumnas_(sh, datos, cab, Object.keys(cols));
}

/** Escribe columnas completas (nunca las que edita el equipo a mano). */
function escribirColumnas_(sh, datos, cab, nombres) {
  const n = datos.length - 1;
  if (n < 1) return;
  const unicos = {};
  nombres.forEach(x => { if (x) unicos[x] = 1; });
  Object.keys(unicos).forEach(nombre => {
    const col = cab.indexOf(nombre) + 1;
    if (col < 1) return;
    const vals = [];
    for (let r = 1; r <= n; r++) vals.push([seguro_(datos[r][col - 1])]);
    sh.getRange(2, col, n, 1).setValues(vals);
  });
}

/** Una fila queda "listo" cuando cada parte con contenido ya tiene su palanca. */
function actualizarEstados_() {
  const sh = hoja_();
  const datos = sh.getDataRange().getValues();
  if (datos.length < 2) return;
  const cab = datos[0], c = n => cab.indexOf(n);
  let cambio = false;
  for (let r = 1; r < datos.length; r++) {
    const f = datos[r];
    if (!f[c('id')]) continue;
    const actual = String(f[c('estado_ia')]);
    if (actual.indexOf('error') === 0) continue;
    let completa = true, algo = false;
    PARTES.forEach(p => {
      const hay = f[c(p + '_escrita')] || f[c(p + '_audio_id')];
      if (!hay) return;
      algo = true;
      if (!f[c(p + '_palanca')]) completa = false;
    });
    let nuevo = actual;
    if (algo && completa) nuevo = 'listo';
    else if (Number(f[c('intentos')]) >= MAX_INTENTOS) nuevo = 'error: no se pudo procesar después de ' + MAX_INTENTOS + ' intentos';
    else nuevo = 'pendiente';
    if (nuevo !== actual) { datos[r][c('estado_ia')] = nuevo; cambio = true; }
  }
  if (cambio) escribirColumnas_(sh, datos, cab, ['estado_ia']);
}

// ---------- Datos para la pantalla ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.accion !== 'datos') return json_({ ok: true, servicio: 'La voz de la Junta' });
  const token = PropertiesService.getScriptProperties().getProperty('PANEL_TOKEN');
  if (!token || String(p.token || '') !== token) return salida_(p, { ok: false, error: 'no autorizado' });
  const filas = hoja_().getDataRange().getValues();
  const cab = filas.shift(), i = n => cab.indexOf(n);
  const voces = [];
  filas.filter(r => r[i('id')] && r[i('ocultar')] !== true).forEach(r => {
    PARTES.forEach((p, n) => {
      const texto = r[i(p + '_transcripcion')] || r[i(p + '_escrita')] || '';
      if (!texto && !r[i(p + '_audio_id')]) return;
      const validada = r[i(p + '_palanca_validada')];
      voces.push({
        momento: n + 1, nombre: r[i('nombre')], organizacion: r[i('organizacion')],
        texto: texto, resumen: r[i(p + '_resumen')],
        palanca: validada || r[i(p + '_palanca')], palanca_2: r[i(p + '_palanca_2')], sector: r[i(p + '_sector')],
        palabras: String(r[i(p + '_palabras')] || '').split(',').map(s => s.trim()).filter(Boolean),
        validada: !!validada, confianza: r[i(p + '_confianza')],
        procesando: !r[i(p + '_palanca')] && !validada, audio: !!r[i(p + '_audio_id')]
      });
    });
  });
  return salida_(p, { ok: true, voces: voces, actualizado: new Date().toISOString() });
}

function salida_(p, obj) {
  const txt = JSON.stringify(obj);
  if (p.callback && /^[A-Za-z_$][\w$]{0,60}$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + txt + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Utilidades ----------
function hoja_() { return SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function corto_(s, n) { return String(s == null ? '' : s).slice(0, n); }
/**
 * Un texto que empieza por = + - @ lo toma la hoja como fórmula ("=IMPORTXML(...)" podría
 * sacar datos). El apóstrofo delante lo deja como texto; la hoja no lo muestra ni lo devuelve.
 * Se aplica en cada escritura, porque escribirColumnas_ reescribe columnas enteras.
 */
function seguro_(v) { return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v; }
function limpiar_(s) {
  const marcas = new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g');
  return String(s || '').normalize('NFD').replace(marcas, '').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 30);
}

// ---------- Pruebas ----------
/** Confirma que las dos claves responden, sin mostrarlas. */
function verificarClaves() {
  const P = PropertiesService.getScriptProperties();
  const pares = [['clave 1 (transcripción)', P.getProperty(CLAVE_AUDIO), MODELOS_AUDIO],
    ['clave 2 (clasificación)', P.getProperty(CLAVE_TEXTO), MODELOS_TEXTO]];
  Logger.log('son distintas: ' + (!!pares[0][1] && !!pares[1][1] && pares[0][1] !== pares[1][1]));
  pares.forEach(par => {
    if (!par[1]) { Logger.log(par[0] + ': NO EXISTE'); return; }
    let ok = '';
    par[2].forEach(m => {
      if (ok) return;
      const g = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-goog-api-key': par[1] }, payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responde solo: ok' }] }] })
      });
      Logger.log('   ' + m + ' -> ' + g.getResponseCode());
      if (g.getResponseCode() === 200) ok = m;
    });
    Logger.log(par[0] + ': ' + (ok ? 'FUNCIONA (' + ok + ')' : 'NINGÚN MODELO RESPONDIÓ'));
  });
}

/** Deja en cola otra vez las filas que quedaron en error. */
function reintentarErrores() {
  const lock = tomarCandado_();
  if (!lock) return;
  try {
    const sh = hoja_(), d = sh.getDataRange().getValues(), cab = d[0];
    const ce = cab.indexOf('estado_ia'), ci = cab.indexOf('intentos');
    let n = 0;
    for (let r = 1; r < d.length; r++) {
      if (String(d[r][ce]).indexOf('error') === 0) { d[r][ce] = 'pendiente'; d[r][ci] = 0; n++; }
    }
    if (n) escribirColumnas_(sh, d, cab, ['estado_ia', 'intentos']);
    Logger.log('Filas devueltas a la cola: ' + n);
  } finally {
    lock.releaseLock();
  }
}

/** Espera a que termine el proceso de cada minuto, para no escribir la hoja al mismo tiempo. */
function tomarCandado_() {
  const lock = LockService.getScriptLock();
  if (lock.tryLock(120000)) return lock;
  Logger.log('El proceso de cada minuto sigue trabajando. Intente de nuevo en un par de minutos.');
  return null;
}

/** Simula envíos para la prueba de carga. No usa Gemini: solo llena la bandeja. */
function simularCarga_(cuantos) {
  const bandeja = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('BANDEJA_ID'));
  const frases = [
    'Necesitamos energía confiable en Mamonal para que la industria crezca',
    'El Canal del Dique nos tiene ahogados, sin eso no hay agro',
    'Hay que formalizar a los pequeños comerciantes del centro',
    'Falta talento bilingüe para el turismo y para el puerto',
    'Sin vías terciarias el campo de Bolívar no saca su cosecha',
    'Queremos que el crédito llegue de verdad a la mipyme'
  ];
  for (let i = 0; i < (cuantos || 200); i++) {
    const f = {
      id: 'prueba-' + Utilities.getUuid(),
      nombre: 'Prueba ' + (i + 1), organizacion: 'Organización ' + ((i % 25) + 1), rol: 'Gerente',
      vision_escrita: frases[i % frases.length],
      compromiso_escrita: 'Nos comprometemos a ' + frases[(i + 3) % frases.length].toLowerCase()
    };
    bandeja.createFile(f.id + '.json', JSON.stringify(f), 'application/json');
  }
  Logger.log('Fichas de prueba creadas: ' + (cuantos || 200));
}

/** Prueba de carga: crea 200 respuestas simuladas en la bandeja. */
function pruebaCarga200() { simularCarga_(200); }

/**
 * Prueba de recepción: manda n envíos SIMULTÁNEOS a la aplicación web publicada, como si
 * n teléfonos enviaran a la vez. A diferencia de pruebaCarga200, esta sí pasa por doPost,
 * que es donde está el límite de ejecuciones simultáneas de Apps Script.
 * Son respuestas escritas, sin audio, con id "prueba-": borrarPruebas() las limpia.
 * Requiere la propiedad del script URL_EXEC con la dirección que termina en /exec.
 */
function probarRecepcion_(n) {
  const url = PropertiesService.getScriptProperties().getProperty('URL_EXEC');
  if (!url || !/\/exec$/.test(url)) {
    Logger.log('Agregue en Propiedades del script URL_EXEC = la dirección de la aplicación web que termina en /exec.');
    return;
  }
  const peticiones = [];
  for (let i = 0; i < n; i++) {
    peticiones.push({
      url: url, method: 'post', contentType: 'text/plain;charset=utf-8', muteHttpExceptions: true,
      payload: JSON.stringify({
        id: 'prueba-' + Utilities.getUuid(), nombre: 'Prueba recepción ' + (i + 1),
        organizacion: 'Organización ' + ((i % 25) + 1), rol: 'Prueba', consentimiento: true,
        vision: { texto: 'Prueba de recepción simultánea número ' + (i + 1) },
        compromiso: { texto: 'Nos comprometemos a probar la recepción' }
      })
    });
  }
  const t0 = Date.now();
  const respuestas = UrlFetchApp.fetchAll(peticiones);
  let ok = 0;
  const fallas = {};
  respuestas.forEach(r => {
    let j = null;
    try { j = JSON.parse(r.getContentText()); } catch (x) {}
    if (j && j.ok) { ok++; return; }
    const k = 'HTTP ' + r.getResponseCode() + ' · ' + (j && j.error ? j.error : 'respuesta que no es JSON');
    fallas[k] = (fallas[k] || 0) + 1;
  });
  Logger.log('Recibidas bien: ' + ok + ' de ' + n + ' en ' + Math.round((Date.now() - t0) / 1000) + ' s');
  Object.keys(fallas).forEach(k => Logger.log('   fallaron ' + fallas[k] + ': ' + k));
  if (ok < n) Logger.log('Las que fallan, el formulario las guarda en el teléfono y las reintenta solo cada 10 a 20 s.');
}

/** Prueba de recepción con 100 envíos simultáneos. */
function pruebaRecepcion100() { probarRecepcion_(100); }

/** Borra las filas y fichas de prueba (las que tienen id que empieza por "prueba-"). */
function borrarPruebas() {
  const lock = tomarCandado_();
  if (!lock) return;
  try {
    const sh = hoja_(), d = sh.getDataRange().getValues();
    for (let r = d.length - 1; r >= 1; r--) {
      if (String(d[r][0]).indexOf('prueba-') === 0) sh.deleteRow(r + 1);
    }
    const bandeja = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('BANDEJA_ID'));
    const it = bandeja.getFiles();
    while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('prueba-') === 0) f.setTrashed(true); }
    Logger.log('Pruebas borradas.');
  } finally {
    lock.releaseLock();
  }
}
