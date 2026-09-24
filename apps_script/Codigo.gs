/**
 * La voz de la Junta — backend v3 (Junta de Juntas, PND 2026-2030)
 *
 * Qué hace:
 *   doPost   recibe cada respuesta del formulario y la deja en la bandeja de Drive (sin tocar la hoja).
 *   procesarPendientes   corre cada minuto: pasa las fichas a la hoja, transcribe los audios
 *            (Gemini, clave 1) y ubica cada respuesta en su palanca (Gemini, clave 2).
 *   doGet    entrega los datos al panel (con la clave del panel) y atiende sus acciones de operador.
 *
 * Historia:
 *  v2  1. El formulario no toca la hoja ni toma candados: guarda en Drive y responde de una.
 *      2. Llamadas a Gemini en paralelo (UrlFetchApp.fetchAll).
 *      3. Dos etapas con clave propia (proyectos distintos): audio -> texto, texto -> palanca (de a 20).
 *      4. La hoja se escribe por columnas completas.
 *      5. (23 sep) Mapa de términos por palanca del Resumen ejecutivo PND v6, reglas de desempate,
 *         ejemplos resueltos y pista determinística por palabras clave.
 *      6. (24 sep) Candado real; resultados escritos por id; la saturación de Gemini no gasta
 *         intentos; un audio dañado solo afecta a su fila; nada se vuelve fórmula en la hoja.
 *  v3  (25 sep, madrugada)
 *      7. El disparador de cada minuto sale en milisegundos cuando no hay trabajo: así no se agota
 *         el tope diario de ejecución de disparadores de Google (90 min en cuentas personales).
 *      8. Motor de respaldo: si el disparador deja de correr, el panel puede pedir el proceso
 *         (doGet accion=procesar). Estado del motor visible en el panel.
 *      9. Tope de tiempo por modelo: ninguna ejecución se acerca al límite de 6 minutos.
 *     10. Las filas se arman según el encabezado real de la hoja; las columnas nuevas se agregan
 *         al final, solas. Nada se corre de lugar aunque alguien agregue una columna.
 *     11. Una tanda de clasificación que la IA no puede responder se reparte de a una, para que
 *         una sola respuesta problemática no bloquee a las otras diecinueve.
 *     12. Notas de voz inaudibles, fichas ilegibles (a cuarentena), envíos repetidos (no duplican
 *         audios), ocultar/validada escritos a mano de cualquier forma.
 *     13. Funciones de operación: diagnostico(), procesarAhora(), archivarEnsayo(),
 *         activarMotor(), pausarMotor(), probarTranscripcion(), revisarDuplicados().
 *
 * Montaje y operación: ver LEEME_montaje.md y GUIA_DEL_DIA.md.
 */

// ---------- Configuración ----------
const VERSION = '3.0 (25 sep 2026)';
const HOJA = 'Voces';
const SHEET_ID = 'PEGUE_AQUI_EL_ID_DE_SU_HOJA';

const CLAVE_AUDIO = 'GEMINI_API_KEY';    // proyecto 1: transcripción
const CLAVE_TEXTO = 'GEMINI_API_KEY_2';  // proyecto 2: clasificación

const MODELOS_AUDIO = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
const MODELOS_TEXTO = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];

const LOTE_AUDIO = 25;   // transcripciones en paralelo por tanda
const LOTE_TEXTO = 20;   // respuestas clasificadas en una sola llamada
const SEG_MAX = 260;     // segundos de trabajo por ejecución del disparador (el tope de Apps Script son 360)
const SEG_TOPE = 330;    // pasado este segundo no se empieza ninguna llamada nueva a Gemini
const SEG_LLAMADA = 65;  // lo que puede tardar, como mucho, una llamada a Gemini
const SEG_RESPALDO = 45; // segundos de trabajo cuando el proceso lo pide el panel (motor de respaldo)
const MAX_INTENTOS = 8;  // fallas REALES (audio ilegible, respuesta vacía o inválida) antes de marcar error
// Gemini saturado (429, 5xx) o un modelo que no existe no es culpa de la respuesta: no gasta
// intentos. Solo si una misma respuesta lleva TOPE_TRANSITORIOS minutos seguidos fallando así,
// se cuenta un intento, para que una respuesta que siempre falla no quede en cola para siempre.
const CODIGOS_TRANSITORIOS = [403, 404, 408, 429, 500, 502, 503, 504];
const TOPE_TRANSITORIOS = 10;
// Mientras Gemini siga saturado, cada minuto se prueba con pocas notas de voz (una sonda) en vez
// de la tanda completa: así una saturación larga no agota el cupo diario de llamadas externas de
// Apps Script (20.000). Apenas una sale bien, se vuelve a la tanda completa.
const SONDA_AUDIO = 3;
const REVISION_COMPLETA_MIN = 10;  // aunque no haya señal de trabajo, cada tanto se revisa todo
const INAUDIBLE = '(inaudible)';   // lo que devuelve la transcripción cuando no se entiende nada
const MAX_AUDIO_B64 = 20000000;    // ~15 MB de audio; una nota de 60 s pesa menos de 2 MB

const PARTES = ['vision', 'compromiso'];
const CAMPOS_PARTE = ['escrita', 'audio_url', 'audio_id', 'transcripcion', 'palanca', 'palanca_2', 'sector', 'resumen', 'confianza', 'palanca_validada'];
const COLUMNAS = ['id', 'recibido', 'nombre', 'organizacion', 'rol']
  .concat(...PARTES.map(p => CAMPOS_PARTE.map(c => p + '_' + c)))
  .concat(['estado_ia', 'intentos', 'ocultar', 'estado', 'notas_equipo', 'consentimiento'])
  .concat(PARTES.map(p => p + '_palabras'))  // al final, para no mover las columnas existentes
  .concat(['enviado']);                       // v3: hora del teléfono al enviar (prueba de la autorización)

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
  if (SHEET_ID.indexOf('PEGUE') === 0) throw new Error('Ponga el ID de su hoja en SHEET_ID, en la configuración de arriba, antes de ejecutar configurar().');
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if (ss.getName() !== 'La voz de la Junta') ss.rename('La voz de la Junta');
  let sh = ss.getSheetByName(HOJA);
  if (!sh) {
    sh = ss.insertSheet(HOJA);
    const h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
    if (h1 && h1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h1);
  }
  const cab = asegurarColumnas_(sh);
  sh.getRange(1, 1, 1, cab.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  const props = PropertiesService.getScriptProperties();
  if (!carpetaExiste_(props.getProperty('CARPETA_ID'))) props.setProperty('CARPETA_ID', DriveApp.createFolder('La voz de la Junta - audios').getId());
  if (!carpetaExiste_(props.getProperty('BANDEJA_ID'))) props.setProperty('BANDEJA_ID', DriveApp.createFolder('La voz de la Junta - bandeja').getId());
  if (!props.getProperty('PANEL_TOKEN')) props.setProperty('PANEL_TOKEN', Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  validaciones_(sh, cab);
  activarMotor();
  Logger.log('Clave del panel: ' + props.getProperty('PANEL_TOKEN'));
  Logger.log('Audios: ' + DriveApp.getFolderById(props.getProperty('CARPETA_ID')).getUrl());
  Logger.log('Bandeja: ' + DriveApp.getFolderById(props.getProperty('BANDEJA_ID')).getUrl());
  if (!props.getProperty(CLAVE_AUDIO) || !props.getProperty(CLAVE_TEXTO)) Logger.log('FALTAN CLAVES: ' + CLAVE_AUDIO + ' y ' + CLAVE_TEXTO);
  Logger.log('Listo. Ejecute diagnostico() para revisar todo de una vez.');
}

/** Crea (o vuelve a crear) el disparador de cada minuto. */
function activarMotor() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'procesarPendientes')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('procesarPendientes').timeBased().everyMinutes(1).create();
  PropertiesService.getScriptProperties().setProperty('HAY_FICHAS', String(Date.now()));  // fuerza una revisión completa
  Logger.log('Motor activo: procesarPendientes corre cada minuto.');
}

/** Quita el disparador. Las respuestas siguen llegando a la bandeja; se procesan al activarlo de nuevo. */
function pausarMotor() {
  let n = 0;
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'procesarPendientes')
    .forEach(t => { ScriptApp.deleteTrigger(t); n++; });
  Logger.log('Motor en pausa (' + n + ' disparador' + (n === 1 ? '' : 'es') + ' quitado' + (n === 1 ? '' : 's') + '). Para reanudar: activarMotor().');
}

/** Agrega al final del encabezado las columnas que falten. Nunca mueve ni renombra las existentes. */
function asegurarColumnas_(sh) {
  const ancho = Math.max(sh.getLastColumn(), 1);
  const cab = sh.getRange(1, 1, 1, ancho).getValues()[0].map(x => String(x == null ? '' : x).trim());
  while (cab.length && !cab[cab.length - 1]) cab.pop();
  const faltan = COLUMNAS.filter(c => cab.indexOf(c) < 0);
  if (faltan.length) {
    const total = cab.length + faltan.length;
    if (sh.getMaxColumns() < total) sh.insertColumnsAfter(sh.getMaxColumns(), total - sh.getMaxColumns());
    sh.getRange(1, cab.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
  }
  return cab.concat(faltan);
}

/** Garantiza que la hoja tenga al menos `n` filas. */
function asegurarFilas_(sh, n) {
  const max = sh.getMaxRows();
  if (max < n) sh.insertRowsAfter(max, n - max + 50);
}

function validaciones_(sh, cab) {
  const filas = 3000;
  asegurarFilas_(sh, filas + 1);
  const lista = SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(PALANCAS), true).setAllowInvalid(false).build();
  PARTES.forEach(p => {
    const k = cab.indexOf(p + '_palanca_validada');
    if (k >= 0) sh.getRange(2, k + 1, filas, 1).setDataValidation(lista);
  });
  const ko = cab.indexOf('ocultar');
  if (ko >= 0) sh.getRange(2, ko + 1, filas, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}

function carpetaExiste_(id) {
  if (!id) return false;
  try { return !DriveApp.getFolderById(id).isTrashed(); } catch (x) { return false; }
}

// ---------- Recepción: sin candado, sin tocar la hoja ----------
function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!d || !d.id || !d.nombre || !d.organizacion) return json_({ ok: false, error: 'faltan datos' });
    const id = String(d.id);
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return json_({ ok: false, error: 'id inválido' });
    if (d.consentimiento !== true) return json_({ ok: false, error: 'sin autorización' });

    // Un teléfono que reenvía (porque no alcanzó a ver la respuesta) no duplica nada.
    const cache = CacheService.getScriptCache();
    if (cache.get('visto_' + id)) return json_({ ok: true, repetido: true });
    const P = PropertiesService.getScriptProperties().getProperties();
    const bandeja = DriveApp.getFolderById(P.BANDEJA_ID);
    if (bandeja.getFilesByName(id + '.json').hasNext()) return json_({ ok: true, repetido: true });

    const carpeta = DriveApp.getFolderById(P.CARPETA_ID);
    const ficha = {
      id: id, nombre: corto_(d.nombre, 120).trim(),
      organizacion: corto_(d.organizacion, 160).trim(), rol: corto_(d.rol, 120).trim(),
      enviado: corto_(d.cliente, 40)
    };
    PARTES.forEach(p => {
      const r = (d[p] && typeof d[p] === 'object') ? d[p] : {};
      ficha[p + '_escrita'] = corto_(r.texto, 3000).trim();
      const a = r.audio;
      if (!a || typeof a.base64 !== 'string' || a.base64.length < 100 || a.base64.length > MAX_AUDIO_B64) return;
      let bytes;
      try { bytes = Utilities.base64Decode(a.base64); } catch (x) { return; }  // audio dañado: se queda el texto, si hay
      const mime = mimeAudio_(a.mime, '');
      const ext = { 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/mp3': 'mp3', 'audio/wav': 'wav' }[mime] || 'webm';
      const nombre = [p, limpiar_(d.organizacion), limpiar_(d.nombre), id.slice(0, 8)].join('_') + '.' + ext;
      const archivo = carpeta.createFile(Utilities.newBlob(bytes, mime, nombre));
      ficha[p + '_audio_url'] = archivo.getUrl();
      ficha[p + '_audio_id'] = archivo.getId();
    });
    bandeja.createFile(id + '.json', JSON.stringify(ficha), 'application/json');
    try { cache.put('visto_' + id, '1', 21600); } catch (x) {}
    try { PropertiesService.getScriptProperties().setProperty('HAY_FICHAS', String(Date.now())); } catch (x) {}
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

// ---------- El motor ----------
/** Lo corre el disparador cada minuto. Sale en milisegundos cuando no hay nada que hacer. */
function procesarPendientes() { procesar_({ seg: SEG_MAX, origen: 'disparador' }); }

/** Para correr a mano desde el editor: procesa ya, haya o no señal de trabajo. */
function procesarAhora() {
  const r = procesar_({ seg: SEG_MAX, origen: 'manual', forzar: true });
  Logger.log(JSON.stringify(r));
}

function procesar_(op) {
  const t0 = Date.now();
  const props = PropertiesService.getScriptProperties();
  const P = props.getProperties();
  // El latido le dice al panel que el disparador está vivo; solo lo marca el disparador.
  if (op.origen === 'disparador') { try { props.setProperty('LATIDO', String(t0)); } catch (x) {} }
  const hayFichas = !!P.HAY_FICHAS;
  const pendientes = Number(P.PENDIENTES || 0);
  const toca = t0 - Number(P.ULTIMA_REVISION || 0) > REVISION_COMPLETA_MIN * 60000;
  if (!op.forzar && !hayFichas && !(pendientes > 0) && !toca) return { hecho: false, motivo: 'sin trabajo' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(op.origen === 'panel' ? 100 : 1000)) return { hecho: false, motivo: 'otro proceso está trabajando' };
  const ctx = {
    t0: t0, fin: t0 + op.seg * 1000,
    tope: t0 + Math.min(SEG_TOPE, op.seg + SEG_LLAMADA + 15) * 1000,
    audio: true, texto: true, fallaron: {}, cab: null, bandeja: -1
  };
  const n = { ingresadas: 0, transcritas: 0, clasificadas: 0 };
  try {
    ctx.cab = asegurarColumnas_(hoja_());
    while (Date.now() < ctx.fin) {
      n.ingresadas += ingresarFichas_(ctx);
      const a = ctx.audio ? transcribirTanda_(ctx) : 0;
      const b = ctx.texto ? clasificarTanda_(ctx) : 0;
      n.transcritas += a; n.clasificadas += b;
      if (!a && !b) break;
    }
    // La señal de fichas nuevas se apaga solo si la bandeja quedó vacía, si nadie envió
    // algo mientras tanto y si ya pasó un minuto (Drive puede tardar en listar un archivo nuevo).
    if (hayFichas && ctx.bandeja === 0 && t0 - Number(P.HAY_FICHAS) > 60000 &&
        props.getProperty('HAY_FICHAS') === P.HAY_FICHAS) props.deleteProperty('HAY_FICHAS');
    const cuenta = actualizarEstados_();
    const fin = Date.now();
    props.setProperties({
      ULTIMA_REVISION: String(fin),
      PENDIENTES: String(cuenta.pendientes),
      ESTADO_MOTOR: JSON.stringify({
        ultima: fin, origen: op.origen, segundos: Math.round((fin - t0) / 1000),
        ingresadas: n.ingresadas, transcritas: n.transcritas, clasificadas: n.clasificadas,
        total: cuenta.total, listas: cuenta.listos, pendientes: cuenta.pendientes, errores: cuenta.errores
      })
    });
    return { hecho: true, ingresadas: n.ingresadas, transcritas: n.transcritas, clasificadas: n.clasificadas, pendientes: cuenta.pendientes, errores: cuenta.errores };
  } finally {
    lock.releaseLock();
  }
}

/** ¿Alcanza el tiempo para empezar otra llamada a Gemini sin acercarse al límite de 6 minutos? */
function hayTiempo_(ctx) { return !ctx || Date.now() + SEG_LLAMADA * 1000 <= ctx.tope; }

/** Pasa las fichas de la bandeja de Drive a filas de la hoja, todas de un golpe. */
function ingresarFichas_(ctx) {
  const bandeja = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('BANDEJA_ID'));
  const it = bandeja.getFiles();
  const fichas = [], archivos = [], malas = [];
  while (it.hasNext() && archivos.length + malas.length < 300) {
    const f = it.next();
    let n = null;
    try { n = JSON.parse(f.getBlob().getDataAsString()); } catch (x) {}
    if (n && n.id) { fichas.push(n); archivos.push(f); } else malas.push(f);
  }
  malas.forEach(aCuarentena_);
  ctx.bandeja = archivos.length + malas.length;
  if (!archivos.length) return 0;

  const sh = hoja_();
  const cab = ctx.cab || asegurarColumnas_(sh);
  const ci = cab.indexOf('id');
  const ultima = sh.getLastRow();
  const vistos = {};
  if (ultima > 1) sh.getRange(2, ci + 1, ultima - 1, 1).getValues().forEach(r => { if (r[0]) vistos[String(r[0])] = 1; });
  const filas = [];
  fichas.forEach(n => {
    if (vistos[String(n.id)]) return;
    vistos[String(n.id)] = 1;
    const o = { id: String(n.id), recibido: new Date(), nombre: n.nombre, organizacion: n.organizacion, rol: n.rol,
      estado_ia: 'pendiente', intentos: 0, ocultar: false, estado: 'sin verificar', consentimiento: 'sí',
      enviado: fecha_(n.enviado) };
    PARTES.forEach(p => CAMPOS_PARTE.forEach(c => {
      if (n[p + '_' + c] !== undefined) o[p + '_' + c] = n[p + '_' + c];
    }));
    filas.push(cab.map(c => (!c || o[c] === undefined || o[c] === null) ? '' : seguro_(o[c])));
  });
  if (filas.length) {
    const desde = sh.getLastRow() + 1;
    asegurarFilas_(sh, desde + filas.length - 1);
    sh.getRange(desde, 1, filas.length, cab.length).setValues(filas);
  }
  archivos.forEach(f => { try { f.setTrashed(true); } catch (x) {} });
  return filas.length;
}

/** Una ficha que no se puede leer no se pierde: va a una carpeta aparte para revisarla a mano. */
function aCuarentena_(f) {
  try {
    const props = PropertiesService.getScriptProperties();
    let id = props.getProperty('CUARENTENA_ID');
    if (!carpetaExiste_(id)) {
      id = DriveApp.createFolder('La voz de la Junta - cuarentena').getId();
      props.setProperty('CUARENTENA_ID', id);
    }
    f.moveTo(DriveApp.getFolderById(id));
  } catch (err) {
    try { f.setTrashed(true); } catch (x) {}
  }
}

/** Etapa 1: audio -> texto, hasta LOTE_AUDIO notas de voz en paralelo. */
function transcribirTanda_(ctx) {
  const sh = hoja_();
  const datos = sh.getDataRange().getValues();
  if (datos.length < 2) return 0;
  const cab = datos[0], c = n => cab.indexOf(n);
  const jobs = [];
  const cache = CacheService.getScriptCache();
  const lote = cache.get('saturado_AUDIO') ? SONDA_AUDIO : LOTE_AUDIO;
  for (let r = 1; r < datos.length && jobs.length < lote; r++) {
    const f = datos[r];
    if (!f[c('id')]) continue;
    if (String(f[c('estado_ia')]).indexOf('error') === 0) continue;
    if (Number(f[c('intentos')]) >= MAX_INTENTOS) continue;
    for (const p of PARTES) {
      if (jobs.length >= lote) break;
      const id = String(f[c('id')]), k = id + ':' + p;
      if (ctx.fallaron[k]) continue;
      if (f[c(p + '_audio_id')] && !f[c(p + '_transcripcion')]) jobs.push({ id: id, p: p, k: k, archivo: String(f[c(p + '_audio_id')]) });
    }
  }
  if (!jobs.length) return 0;
  if (!hayTiempo_(ctx)) { ctx.audio = false; return 0; }

  const clave = PropertiesService.getScriptProperties().getProperty(CLAVE_AUDIO);
  if (!clave) { registrarFallo_('AUDIO', { codigo: 0, modelo: '', detalle: 'falta la clave ' + CLAVE_AUDIO + ' en Propiedades del script' }); ctx.audio = false; return 0; }
  const listos = [];
  jobs.forEach(j => {
    // Un audio borrado o dañado solo afecta a su respuesta, no detiene la tanda.
    try { cuerpoAudio_(j); listos.push(j); } catch (err) { j.real = true; }
  });

  if (listos.length) enParalelo_(listos, MODELOS_AUDIO, clave, 'AUDIO', ctx);
  const cambios = [], hechos = jobs.filter(j => j.texto);
  hechos.forEach(j => {
    const t = /^[\[(]?\s*inaudible\s*[\])]?\.?$/i.test(j.texto) ? INAUDIBLE : j.texto;
    cambios.push({ id: j.id, campo: j.p + '_transcripcion', valor: t });
  });
  const fallas = jobs.filter(j => !j.texto);
  fallas.forEach(j => { ctx.fallaron[j.k] = 1; });
  const reales = fallas.filter(j => j.real);
  const transitorias = fallas.filter(j => !j.real && j.transitoria);
  if (hechos.length) cache.remove('saturado_AUDIO');
  else if (transitorias.length) {
    ctx.audio = false;  // Gemini saturado: esperar al siguiente minuto, y entonces probar con una sonda
    cache.put('saturado_AUDIO', '1', 3600);
  }
  aplicarPorId_(sh, cambios, reales.map(j => j.id).concat(contarTransitorias_(transitorias)));
  return hechos.length;
}

/** Arma la petición de transcripción de un audio guardado en Drive. */
function cuerpoAudio_(j) {
  const archivo = DriveApp.getFileById(j.archivo);
  const blob = archivo.getBlob();
  j.mime = mimeAudio_(blob.getContentType(), archivo.getName());
  j.bytes = blob.getBytes().length;
  j.cuerpo = {
    contents: [{ role: 'user', parts: [
      { text: 'Transcribe literalmente esta nota de voz, en español de Colombia, con puntuación. No resumas, no corrijas, no agregues nada. Quita solo las muletillas repetidas. Responde únicamente con la transcripción. Si no se entiende ninguna palabra, responde exactamente: ' + INAUDIBLE },
      { inline_data: { mime_type: j.mime, data: Utilities.base64Encode(blob.getBytes()) } }
    ] }],
    generationConfig: { temperature: 0 }
  };
}

/** Un solo nombre por formato, venga como venga del teléfono o de Drive (Drive a veces dice video/webm). */
function mimeAudio_(tipo, nombre) {
  const t = String(tipo || '').toLowerCase().split(';')[0] + ' ' + String(nombre || '').toLowerCase();
  if (/mp4|m4a/.test(t)) return 'audio/mp4';
  if (/aac/.test(t)) return 'audio/aac';
  if (/ogg|opus$/.test(t)) return 'audio/ogg';
  if (/mpeg|mp3/.test(t)) return 'audio/mp3';
  if (/wav/.test(t)) return 'audio/wav';
  return 'audio/webm';
}

/** Etapa 2: texto -> palanca, sector, resumen y palabras. Hasta LOTE_TEXTO en UNA sola llamada. */
function clasificarTanda_(ctx) {
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
      const audio = f[c(p + '_audio_id')], tr = String(f[c(p + '_transcripcion')] || '');
      if (audio && !tr) continue; // espera a que se transcriba
      const texto = (tr && tr !== INAUDIBLE) ? tr : String(f[c(p + '_escrita')] || '');
      if (!texto.trim()) continue;
      const id = String(f[c('id')]), k = id + ':' + p;
      if (ctx.fallaron[k]) continue;
      items.push({ id: id, p: p, k: k, texto: texto });
    }
  }
  if (!items.length) return 0;
  if (!hayTiempo_(ctx)) { ctx.texto = false; return 0; }

  const clave = PropertiesService.getScriptProperties().getProperty(CLAVE_TEXTO);
  if (!clave) { registrarFallo_('TEXTO', { codigo: 0, modelo: '', detalle: 'falta la clave ' + CLAVE_TEXTO + ' en Propiedades del script' }); ctx.texto = false; return 0; }
  items.forEach(it => { ctx.fallaron[it.k] = 1; });  // se desmarcan abajo las que salgan bien

  const hechos = {}, cambios = [], reales = [], transitorias = [];
  const lote = trabajoClasificacion_(items);
  enParalelo_([lote], MODELOS_TEXTO, clave, 'TEXTO', ctx);
  if (lote.texto) leerClasificacion_(lote.texto, items, hechos, cambios);
  const faltan = items.filter(it => !hechos[it.k]);

  if (faltan.length) {
    const saturado = !lote.texto && !lote.real && lote.transitoria;
    const sinIntento = !lote.texto && !lote.real && !lote.transitoria;
    if (saturado) {
      transitorias.push.apply(transitorias, faltan);
      ctx.texto = false;  // Gemini saturado: esperar al siguiente minuto
    } else if (sinIntento) {
      // no alcanzó el tiempo: se reintenta en la siguiente ejecución, sin gastar nada
    } else if (items.length === 1) {
      reales.push.apply(reales, faltan);
    } else if (hayTiempo_(ctx)) {
      // La IA no pudo con la tanda completa (vacía, ilegible o incompleta): se reparte de a una,
      // para que una sola respuesta problemática no bloquee a las demás.
      const solos = faltan.map(it => trabajoClasificacion_([it]));
      enParalelo_(solos, MODELOS_TEXTO, clave, 'TEXTO', ctx);
      solos.forEach(s => {
        const it = s.items[0];
        if (s.texto) leerClasificacion_(s.texto, s.items, hechos, cambios);
        if (hechos[it.k]) return;
        if (s.texto || s.real) reales.push(it);
        else if (s.transitoria) transitorias.push(it);
      });
    }
  }
  Object.keys(hechos).forEach(k => { delete ctx.fallaron[k]; });
  aplicarPorId_(sh, cambios, reales.map(it => it.id).concat(contarTransitorias_(transitorias)));
  return Object.keys(hechos).length;
}

function trabajoClasificacion_(items) {
  return {
    items: items,
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
}

/** Lee la respuesta de la IA con desconfianza: solo entra lo que tiene forma válida. */
function leerClasificacion_(texto, items, hechos, cambios) {
  let salida = null;
  try { salida = JSON.parse(String(texto).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')); } catch (x) { return; }
  if (salida && !Array.isArray(salida) && typeof salida === 'object') {
    const arr = Object.keys(salida).map(k => salida[k]).filter(Array.isArray)[0];
    salida = arr || [salida];
  }
  if (!Array.isArray(salida)) return;
  salida.forEach(o => {
    if (!o || typeof o !== 'object') return;
    const it = items.length === 1 ? items[0] : items[Number(o.n) - 1];
    if (!it || hechos[it.k] || !PALANCAS[o.palanca]) return;
    hechos[it.k] = 1;
    const seg = (PALANCAS[o.palanca_secundaria] && o.palanca_secundaria !== o.palanca) ? o.palanca_secundaria : '';
    const palabras = (Array.isArray(o.palabras) ? o.palabras : [])
      .map(w => String(w || '').replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30))
      .filter(Boolean).slice(0, 3);
    const pares = [['palanca', o.palanca], ['palanca_2', seg], ['sector', SECTORES[o.sector] ? o.sector : ''],
      ['resumen', corto_(o.resumen, 300).trim()], ['confianza', ['alta', 'media', 'baja'].indexOf(o.confianza) >= 0 ? o.confianza : ''],
      ['palabras', palabras.join(', ')]];
    pares.forEach(par => cambios.push({ id: it.id, campo: it.p + '_' + par[0], valor: par[1] }));
  });
}

// ---------- Conocimiento para clasificar (Resumen ejecutivo PND v6) ----------
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
 * Lanza todas las llamadas de una tanda a la vez y reintenta con el siguiente modelo las que fallen.
 * Cada job que sale bien queda con j.texto. Los que fallan quedan marcados:
 *   j.real        alguna falla fue culpa de la respuesta misma (400, respuesta vacía o ilegible)
 *   j.transitoria alguna falla fue saturación o configuración (CODIGOS_TRANSITORIOS, clave inválida)
 *   ninguna       no se alcanzó a intentar (se acabó el tiempo de esta ejecución)
 * Con ctx, no empieza un modelo nuevo si no alcanza el tiempo.
 */
function enParalelo_(jobs, modelos, clave, tipo, ctx) {
  let quedan = jobs.slice();
  const props = PropertiesService.getScriptProperties();
  const preferido = props.getProperty('MODELO_' + tipo);
  const orden = (preferido && modelos.indexOf(preferido) >= 0)
    ? [preferido].concat(modelos.filter(m => m !== preferido)) : modelos.slice();
  let fallo = null, exito = false;
  for (const modelo of orden) {
    if (!quedan.length) break;
    if (!hayTiempo_(ctx)) break;
    const peticiones = quedan.map(j => ({
      url: 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent',
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': clave }, payload: JSON.stringify(j.cuerpo)
    }));
    let respuestas;
    try { respuestas = UrlFetchApp.fetchAll(peticiones); }
    catch (err) {
      quedan.forEach(j => { j.transitoria = true; });
      fallo = { codigo: 0, modelo: modelo, detalle: String((err && err.message) || err).slice(0, 200) };
      continue;
    }
    const siguen = [];
    respuestas.forEach((resp, i) => {
      const j = quedan[i], code = resp.getResponseCode();
      if (code !== 200) {
        const detalle = detalleError_(resp);
        // Una clave inválida o un proyecto sin acceso no es culpa de la respuesta: no gasta intentos.
        const deConfig = code === 400 && /API_KEY_INVALID|API key not valid|FAILED_PRECONDITION|not supported|billing/i.test(detalle);
        if (CODIGOS_TRANSITORIOS.indexOf(code) >= 0 || deConfig) j.transitoria = true; else j.real = true;
        fallo = { codigo: code, modelo: modelo, detalle: detalle };
        siguen.push(j);
        return;
      }
      try {
        const cuerpo = JSON.parse(resp.getContentText());
        const cand = (cuerpo.candidates || [])[0] || {};
        const txt = ((cand.content || {}).parts || []).map(x => x.text || '').join('').trim();
        if (txt) { j.texto = txt; exito = true; }
        else {
          j.real = true;
          fallo = { codigo: 200, modelo: modelo, detalle: 'respuesta vacía' + (cand.finishReason ? ' (' + cand.finishReason + ')' : '') +
            (cuerpo.promptFeedback && cuerpo.promptFeedback.blockReason ? ' (bloqueo: ' + cuerpo.promptFeedback.blockReason + ')' : '') };
          siguen.push(j);
        }
      } catch (x) {
        j.real = true;
        fallo = { codigo: 200, modelo: modelo, detalle: 'respuesta ilegible' };
        siguen.push(j);
      }
    });
    if (siguen.length < quedan.length) { try { props.setProperty('MODELO_' + tipo, modelo); } catch (x) {} }
    quedan = siguen;
  }
  if (exito) { try { props.setProperty('EXITO_' + tipo, String(Date.now())); } catch (x) {} }
  if (fallo) registrarFallo_(tipo, fallo);
  return quedan;
}

function detalleError_(resp) {
  const t = String(resp.getContentText() || '');
  try {
    const e = JSON.parse(t).error || {};
    return String((e.status ? e.status + ': ' : '') + (e.message || '')).slice(0, 200);
  } catch (x) {
    return t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  }
}

/** Guarda la última falla de Gemini para el panel y para diagnostico(). */
function registrarFallo_(tipo, fallo) {
  try {
    PropertiesService.getScriptProperties().setProperty('ULTIMO_FALLO', JSON.stringify({
      tipo: tipo, codigo: fallo.codigo, modelo: fallo.modelo, detalle: fallo.detalle, cuando: Date.now()
    }));
  } catch (x) {}
}

/**
 * Cuenta las fallas por saturación de cada respuesta entre ejecuciones. Devuelve los ids
 * de las filas que ya llevan TOPE_TRANSITORIOS seguidas: esas sí gastan un intento.
 */
function contarTransitorias_(lista) {
  if (!lista.length) return [];
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
    if (r === undefined || sumados[id] || kn < 0) return;
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

/** Una fila queda "listo" cuando cada parte con contenido ya tiene su palanca. Devuelve el conteo. */
function actualizarEstados_() {
  const sh = hoja_();
  const datos = sh.getDataRange().getValues();
  const cuenta = { total: 0, listos: 0, pendientes: 0, errores: 0, vacias: 0 };
  if (datos.length < 2) return cuenta;
  const cab = datos[0], c = n => cab.indexOf(n);
  let cambio = false;
  for (let r = 1; r < datos.length; r++) {
    const f = datos[r];
    if (!f[c('id')]) continue;
    cuenta.total++;
    const actual = String(f[c('estado_ia')]);
    if (actual.indexOf('error') === 0) { cuenta.errores++; continue; }
    let completa = true, algo = false;
    PARTES.forEach(p => {
      const escrita = String(f[c(p + '_escrita')] || '').trim(), audio = f[c(p + '_audio_id')];
      if (!escrita && !audio) return;
      algo = true;
      if (f[c(p + '_palanca')] || palancaDe_(f[c(p + '_palanca_validada')])) return;  // ubicada por la IA o a mano
      if (audio && f[c(p + '_transcripcion')] === INAUDIBLE && !escrita) return;       // inaudible y sin texto: nada que ubicar
      completa = false;
    });
    let nuevo;
    if (!algo) nuevo = 'sin respuesta';
    else if (completa) nuevo = 'listo';
    else if (Number(f[c('intentos')]) >= MAX_INTENTOS) nuevo = 'error: no se pudo procesar después de ' + MAX_INTENTOS + ' intentos';
    else nuevo = 'pendiente';
    if (nuevo === 'listo') cuenta.listos++;
    else if (nuevo === 'pendiente') cuenta.pendientes++;
    else if (nuevo === 'sin respuesta') cuenta.vacias++;
    else cuenta.errores++;
    if (nuevo !== actual) { datos[r][c('estado_ia')] = nuevo; cambio = true; }
  }
  if (cambio) escribirColumnas_(sh, datos, cab, ['estado_ia']);
  return cuenta;
}

// ---------- Panel: datos y acciones de operador ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  const accion = String(p.accion || '');
  if (!accion) return salida_(p, { ok: true, servicio: 'La voz de la Junta', version: VERSION });
  const token = PropertiesService.getScriptProperties().getProperty('PANEL_TOKEN');
  if (!token || String(p.token || '') !== token) return salida_(p, { ok: false, error: 'no autorizado' });
  try {
    if (accion === 'datos') return salida_(p, datosPanel_());
    if (accion === 'estado') return salida_(p, { ok: true, motor: estadoMotor_(true) });
    if (accion === 'procesar') {
      const r = procesar_({ seg: SEG_RESPALDO, origen: 'panel' });
      return salida_(p, { ok: true, resultado: r, motor: estadoMotor_(false) });
    }
    if (accion === 'reintentar') return salida_(p, { ok: true, devueltas: reintentarErrores_(20000) });
    return salida_(p, { ok: false, error: 'acción desconocida' });
  } catch (err) {
    return salida_(p, { ok: false, error: String((err && err.message) || err) });
  }
}

function datosPanel_() {
  const filas = hoja_().getDataRange().getValues();
  const cab = filas.shift(), i = n => cab.indexOf(n);
  const voces = [];
  filas.forEach(r => {
    if (!r[i('id')] || esVerdad_(r[i('ocultar')])) return;
    const errorFila = String(r[i('estado_ia')]).indexOf('error') === 0;
    PARTES.forEach((p, n) => {
      const escrita = String(r[i(p + '_escrita')] || '').trim();
      const tr = String(r[i(p + '_transcripcion')] || '').trim();
      const audio = !!r[i(p + '_audio_id')];
      if (!escrita && !audio) return;
      const inaudible = tr === INAUDIBLE;
      const texto = (tr && !inaudible) ? tr : escrita;
      const validada = palancaDe_(r[i(p + '_palanca_validada')]);
      const ia = PALANCAS[r[i(p + '_palanca')]] ? String(r[i(p + '_palanca')]) : '';
      const palanca = validada || ia;
      const perdida = !palanca && (errorFila || (inaudible && !escrita));
      voces.push({
        id: String(r[i('id')]) + ':' + p,
        momento: n + 1, nombre: String(r[i('nombre')] || ''), organizacion: String(r[i('organizacion')] || ''),
        texto: recorta_(texto, 700), resumen: String(r[i(p + '_resumen')] || ''),
        palanca: palanca, palanca_2: String(r[i(p + '_palanca_2')] || ''), sector: String(r[i(p + '_sector')] || ''),
        palabras: String(r[i(p + '_palabras')] || '').split(',').map(s => s.trim()).filter(Boolean),
        validada: !!validada, confianza: String(r[i(p + '_confianza')] || ''),
        procesando: !palanca && !perdida, fallida: perdida, audio: audio
      });
    });
  });
  return { ok: true, voces: voces, actualizado: new Date().toISOString(), motor: estadoMotor_(false) };
}

/** Lo que el panel necesita saber del motor. Con `completo`, revisa además el disparador. */
function estadoMotor_(completo) {
  const P = PropertiesService.getScriptProperties().getProperties();
  let ultimo = {}, fallo = null;
  try { ultimo = JSON.parse(P.ESTADO_MOTOR || '{}'); } catch (x) {}
  try { fallo = P.ULTIMO_FALLO ? JSON.parse(P.ULTIMO_FALLO) : null; } catch (x) {}
  const m = {
    version: VERSION, ahora: Date.now(),
    latido: Number(P.LATIDO || 0), ultima: Number(ultimo.ultima || 0), origen: ultimo.origen || '',
    pendientes: Number(P.PENDIENTES || 0), errores: Number(ultimo.errores || 0), total: Number(ultimo.total || 0),
    hayFichas: !!P.HAY_FICHAS,
    exitoAudio: Number(P.EXITO_AUDIO || 0), exitoTexto: Number(P.EXITO_TEXTO || 0),
    fallo: fallo
  };
  if (completo) {
    try { m.disparador = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'procesarPendientes').length; } catch (x) {}
  }
  return m;
}

function salida_(p, obj) {
  const txt = JSON.stringify(obj);
  if (p.callback && /^[A-Za-z_$][\w$]{0,60}$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + txt + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Utilidades ----------
let HOJA_CACHE_ = null;
function hoja_() {
  if (HOJA_CACHE_) return HOJA_CACHE_;
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA);
  if (!sh) throw new Error('No existe la hoja "' + HOJA + '". Ejecute configurar().');
  HOJA_CACHE_ = sh;
  return sh;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function corto_(s, n) { return String(s == null ? '' : s).slice(0, n); }
function recorta_(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
function fecha_(s) { if (!s) return ''; const d = new Date(s); return isNaN(d.getTime()) ? '' : d; }
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
/** La casilla `ocultar` cuenta como marcada aunque alguien escriba TRUE, sí, x o 1 a mano. */
function esVerdad_(v) { return v === true || /^(true|verdadero|s[ií]|x|1|ocultar)$/i.test(String(v == null ? '' : v).trim()); }
/** La palanca validada a mano vale aunque venga con mayúscula, tilde o el nombre largo ("Reglas claras"). */
function palancaDe_(v) {
  const n = normal_(v);
  if (!n) return '';
  if (PALANCAS[n]) return n;
  const k = Object.keys(PALANCAS).filter(x => n.indexOf(x) === 0 || (n.length >= 4 && x.indexOf(n) === 0));
  return k.length === 1 ? k[0] : '';
}
function tomarCandado_(ms) {
  const lock = LockService.getScriptLock();
  if (lock.tryLock(ms || 120000)) return lock;
  Logger.log('El proceso de cada minuto sigue trabajando. Intente de nuevo en un par de minutos.');
  return null;
}
/** Borra filas (números de fila de la hoja) de abajo hacia arriba, por bloques contiguos. */
function borrarFilas_(sh, filas) {
  if (!filas.length) return;
  // Sheets no deja borrar todas las filas no congeladas: si hiciera falta, se agrega una vacía al final.
  if (sh.getMaxRows() - sh.getFrozenRows() <= filas.length) sh.insertRowsAfter(sh.getMaxRows(), 1);
  const f = filas.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < f.length) {
    const fin = f[i];
    let ini = fin;
    while (i + 1 < f.length && f[i + 1] === ini - 1) { i++; ini = f[i]; }
    sh.deleteRows(ini, fin - ini + 1);
    i++;
  }
}

// ---------- Operación y pruebas (se corren a mano desde el editor) ----------

/** Revisa todo de una vez y dice qué está bien y qué hay que arreglar. */
function diagnostico() {
  const L = ['La voz de la Junta · backend ' + VERSION, ''];
  const ok = (b, t) => L.push((b ? 'OK       ' : 'REVISAR  ') + t);
  const P = PropertiesService.getScriptProperties().getProperties();
  const ahora = Date.now();
  const hace = ms => Math.round((ahora - ms) / 1000) + ' s';

  ok(SHEET_ID.indexOf('PEGUE') !== 0, 'SHEET_ID configurado');
  let sh = null;
  try { sh = hoja_(); } catch (err) { ok(false, 'Hoja: ' + ((err && err.message) || err)); }
  if (sh) {
    const ancho = Math.max(sh.getLastColumn(), 1);
    const cab = sh.getRange(1, 1, 1, ancho).getValues()[0].map(String);
    const faltan = COLUMNAS.filter(c => cab.indexOf(c) < 0);
    ok(!faltan.length, faltan.length ? 'Faltan columnas: ' + faltan.join(', ') + ' (las agrega el siguiente proceso o configurar())' : 'Encabezado completo (' + cab.length + ' columnas)');
    const d = sh.getDataRange().getValues(), ce = d[0].indexOf('estado_ia');
    const est = {};
    for (let r = 1; r < d.length; r++) { if (!d[r][d[0].indexOf('id')]) continue; const e = String(d[r][ce] || '(vacío)').split(':')[0]; est[e] = (est[e] || 0) + 1; }
    ok(true, 'Filas: ' + (Object.keys(est).length ? Object.keys(est).map(k => k + ' ' + est[k]).join(' · ') : 'ninguna'));
    ok(!est.error, est.error ? est.error + ' fila(s) en error: reintentarErrores()' : 'Sin filas en error');
  }
  [['CARPETA_ID', 'Carpeta de audios'], ['BANDEJA_ID', 'Bandeja']].forEach(x => ok(carpetaExiste_(P[x[0]]), x[1] + (P[x[0]] ? '' : ': no existe, ejecute configurar()')));
  if (carpetaExiste_(P.BANDEJA_ID)) {
    let n = 0; const it = DriveApp.getFolderById(P.BANDEJA_ID).getFiles(); while (it.hasNext() && n < 1000) { it.next(); n++; }
    ok(n < 50, 'Fichas esperando en la bandeja: ' + n);
  }
  ok(!!P.PANEL_TOKEN, 'Clave del panel (PANEL_TOKEN)');
  ok(!!P[CLAVE_AUDIO] && !!P[CLAVE_TEXTO], 'Claves de Gemini presentes (' + CLAVE_AUDIO + ', ' + CLAVE_TEXTO + ')');
  ok(!!P[CLAVE_AUDIO] && P[CLAVE_AUDIO] !== P[CLAVE_TEXTO], 'Las dos claves son distintas (deben ser de dos proyectos de Google Cloud)');
  ok(/\/exec$/.test(P.URL_EXEC || ''), 'URL_EXEC para pruebaRecepcion100()' + (P.URL_EXEC ? '' : ': falta (opcional)'));
  let disp = 0;
  try { disp = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'procesarPendientes').length; } catch (x) {}
  ok(disp === 1, 'Disparador de cada minuto: ' + disp + (disp === 1 ? '' : disp ? ' (sobran; ejecute activarMotor())' : ' (ejecute activarMotor())'));
  ok(P.LATIDO && ahora - Number(P.LATIDO) < 180000, 'Último latido del disparador: ' + (P.LATIDO ? 'hace ' + hace(Number(P.LATIDO)) : 'nunca'));
  if (P.EXITO_AUDIO) ok(true, 'Última transcripción buena: hace ' + hace(Number(P.EXITO_AUDIO)));
  if (P.EXITO_TEXTO) ok(true, 'Última clasificación buena: hace ' + hace(Number(P.EXITO_TEXTO)));
  if (P.ULTIMO_FALLO) {
    try {
      const f = JSON.parse(P.ULTIMO_FALLO);
      ok(ahora - f.cuando > 600000, 'Última falla de Gemini (' + f.tipo + ', ' + f.modelo + ', código ' + f.codigo + ') hace ' + hace(f.cuando) + ': ' + f.detalle);
    } catch (x) {}
  }
  if (P.MODELO_AUDIO || P.MODELO_TEXTO) ok(true, 'Modelos en uso: audio ' + (P.MODELO_AUDIO || '-') + ' · texto ' + (P.MODELO_TEXTO || '-'));
  Logger.log(L.join('\n'));
  return L;
}

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
      Logger.log('   ' + m + ' -> ' + g.getResponseCode() + (g.getResponseCode() === 200 ? '' : ' ' + detalleError_(g)));
      if (g.getResponseCode() === 200) ok = m;
    });
    Logger.log(par[0] + ': ' + (ok ? 'FUNCIONA (' + ok + ')' : 'NINGÚN MODELO RESPONDIÓ'));
  });
}

/**
 * Transcribe la nota de voz más reciente de la carpeta de audios y muestra el resultado.
 * Para el ensayo: grabar desde un Android y desde un iPhone, y correr esto después de cada uno.
 */
function probarTranscripcion() {
  const P = PropertiesService.getScriptProperties();
  const clave = P.getProperty(CLAVE_AUDIO);
  if (!clave) { Logger.log('Falta ' + CLAVE_AUDIO); return; }
  const it = DriveApp.getFolderById(P.getProperty('CARPETA_ID')).getFiles();
  let ultimo = null;
  while (it.hasNext()) { const f = it.next(); if (!ultimo || f.getDateCreated() > ultimo.getDateCreated()) ultimo = f; }
  if (!ultimo) { Logger.log('Todavía no hay audios. Grabe una nota desde el formulario, espere a que llegue y vuelva a correr esto.'); return; }
  const j = { archivo: ultimo.getId() };
  cuerpoAudio_(j);
  Logger.log('Audio: ' + ultimo.getName() + ' · ' + j.mime + ' · ' + Math.round(j.bytes / 1024) + ' KB · ' + ultimo.getDateCreated());
  enParalelo_([j], MODELOS_AUDIO, clave, 'AUDIO', null);
  if (j.texto) Logger.log('TRANSCRIPCIÓN (' + (P.getProperty('MODELO_AUDIO') || '') + '):\n' + j.texto);
  else Logger.log('NO SE PUDO TRANSCRIBIR. Última falla: ' + (P.getProperty('ULTIMO_FALLO') || '-'));
}

/** Deja en cola otra vez las filas que quedaron en error. */
function reintentarErrores() {
  const n = reintentarErrores_(120000);
  if (n >= 0) Logger.log('Filas devueltas a la cola: ' + n);
}

function reintentarErrores_(espera) {
  const lock = tomarCandado_(espera);
  if (!lock) return -1;
  try {
    const sh = hoja_(), d = sh.getDataRange().getValues(), cab = d[0];
    const ce = cab.indexOf('estado_ia'), ci = cab.indexOf('intentos');
    let n = 0;
    for (let r = 1; r < d.length; r++) {
      if (String(d[r][ce]).indexOf('error') === 0) { d[r][ce] = 'pendiente'; d[r][ci] = 0; n++; }
    }
    if (n) {
      escribirColumnas_(sh, d, cab, ['estado_ia', 'intentos']);
      PropertiesService.getScriptProperties().setProperty('PENDIENTES', String(n));
    }
    return n;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Antes de abrir el formulario el día del evento: copia todo lo que hay en la hoja a una
 * pestaña "Ensayo <fecha>" y deja la hoja Voces vacía, lista para las respuestas reales.
 * No borra nada sin copiarlo antes. Las fichas que estén en la bandeja entran primero a la hoja.
 */
function archivarEnsayo() {
  const lock = tomarCandado_(120000);
  if (!lock) return;
  try {
    ingresarFichas_({});
    const ss = SpreadsheetApp.openById(SHEET_ID), sh = hoja_();
    const ultima = sh.getLastRow();
    if (ultima < 2) { Logger.log('La hoja Voces ya está vacía. No hay nada que archivar.'); return; }
    const nombre = 'Ensayo ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm.ss');
    sh.copyTo(ss).setName(nombre);
    const filas = [];
    for (let r = 2; r <= ultima; r++) filas.push(r);
    borrarFilas_(sh, filas);
    const props = PropertiesService.getScriptProperties();
    props.setProperty('PENDIENTES', '0');
    props.deleteProperty('ESTADO_MOTOR');
    Logger.log('Listo: ' + (ultima - 1) + ' filas copiadas a la pestaña "' + nombre + '". La hoja Voces quedó vacía.');
  } finally {
    lock.releaseLock();
  }
}

/** Busca personas que respondieron más de una vez (mismo nombre y organización). Solo informa. */
function revisarDuplicados() {
  const d = hoja_().getDataRange().getValues(), cab = d[0], c = n => cab.indexOf(n);
  const grupos = {};
  for (let r = 1; r < d.length; r++) {
    if (!d[r][c('id')] || esVerdad_(d[r][c('ocultar')])) continue;
    const k = normal_(d[r][c('nombre')]) + ' · ' + normal_(d[r][c('organizacion')]);
    (grupos[k] = grupos[k] || []).push(r + 1);
  }
  const rep = Object.keys(grupos).filter(k => grupos[k].length > 1);
  Logger.log(rep.length
    ? 'Posibles duplicados (marque "ocultar" en los que sobren):\n' + rep.map(k => '  ' + k + ': filas ' + grupos[k].join(', ')).join('\n')
    : 'No hay nombres repetidos.');
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
      compromiso_escrita: 'Nos comprometemos a ' + frases[(i + 3) % frases.length].toLowerCase(),
      enviado: new Date().toISOString()
    };
    bandeja.createFile(f.id + '.json', JSON.stringify(f), 'application/json');
  }
  PropertiesService.getScriptProperties().setProperty('HAY_FICHAS', String(Date.now()));
  Logger.log('Fichas de prueba creadas: ' + (cuantos || 200));
}

/** Prueba de carga: crea 200 respuestas simuladas en la bandeja (no pasa por la recepción). */
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
        compromiso: { texto: 'Nos comprometemos a probar la recepción' },
        cliente: new Date().toISOString()
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
  const lock = tomarCandado_(120000);
  if (!lock) return;
  try {
    const sh = hoja_(), d = sh.getDataRange().getValues(), ci = d[0].indexOf('id');
    const filas = [];
    for (let r = 1; r < d.length; r++) if (String(d[r][ci]).indexOf('prueba-') === 0) filas.push(r + 1);
    borrarFilas_(sh, filas);
    const bandeja = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('BANDEJA_ID'));
    const it = bandeja.getFiles();
    let n = 0;
    while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('prueba-') === 0) { f.setTrashed(true); n++; } }
    actualizarEstados_();
    Logger.log('Pruebas borradas: ' + filas.length + ' filas y ' + n + ' fichas de la bandeja.');
  } finally {
    lock.releaseLock();
  }
}
