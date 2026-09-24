
/* ===== La voz de la Junta ===== */
(function(){
/* CONFIGURACIÓN — pegue aquí la URL del Apps Script (termina en /exec).
   Vacía = datos de prueba. También puede pasarse en la dirección: ...html?fuente=URL */
const VOZ_CONFIG={
  url:"",
  token:"",         // clave del panel (Propiedades del script > PANEL_TOKEN)
  refrescoSeg:20,   // cada cuánto se consultan voces nuevas
  respaldo:true,    // si el disparador de Apps Script deja de correr, el panel pide el proceso
};
/* Parámetros de la dirección:
     ?fuente=URL_/exec&clave=CLAVE   datos en vivo (la fuente solo se acepta si apunta al Apps Script)
     &seccion=nube|analisis|arbol    sección con la que abre
     &forma=piramide|ramas|burbujas  forma del árbol de logos
     &rotar=30                       en proyección, cambia de sección cada 30 s
     &proyectar=1                    abre en modo proyección (la pantalla completa se pide con un clic o con P)
     &refresco=20                    cada cuántos segundos se piden datos nuevos (de 3 a 300) */
const VOZ_Q=(()=>{try{return new URLSearchParams(location.search)}catch(e){return {get:()=>null}}})();
try{const f=VOZ_Q.get("fuente");
  if(f&&/^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+\/|macros\/)s\/[\w-]+\/(exec|dev)$/.test(f))VOZ_CONFIG.url=f;
  const k=VOZ_Q.get("clave");if(k)VOZ_CONFIG.token=k;
  const r=Number(VOZ_Q.get("refresco"));if(r>=3&&r<=300)VOZ_CONFIG.refrescoSeg=r}catch(e){}

const PAL=[["conectividad","Conectividad","t"],["energia","Energía","t"],["agua","Agua","t"],["clima","Clima","t"],["reglas","Reglas claras","e"],["credito","Crédito","e"],["formacion","Formación","e"],["brechas","Brechas","g"],["instituciones","Instituciones","g"]];
const FAM={t:"Lo que el territorio pone",e:"Lo que mueve a las empresas",g:"Lo que sostiene a la gente"};
const SECT=[["maritimo","Marítimo","Marít."],["energia","Energía","Energ."],["turismo","Turismo","Turis."],["industria","Industria","Indus."],["agro","Agro","Agro"],["comext","Com. exterior","Com. ext."],["desemp","Des. empresarial","Des. emp."],["hogares","Hogares y social","Hogares"]];
const MOM={1:"Visión",2:"Compromiso"};
const palN=Object.fromEntries(PAL.map(p=>[p[0],p[1]])),palF=Object.fromEntries(PAL.map(p=>[p[0],p[2]]));
const secN=Object.fromEntries(SECT.map(x=>[x[0],x[1]]));
const MIC='<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

/* NUBE DE PALABRAS — nucleo curado (palabra -> palanca). Las de fuera entran con 3+ menciones. */
const VOCAB={
 vias:"conectividad",puerto:"conectividad",aeropuerto:"conectividad",tren:"conectividad",conectividad:"conectividad",logistica:"conectividad",dragado:"conectividad",corredores:"conectividad",internet:"conectividad",
 energia:"energia",tarifas:"energia",gas:"energia",renovables:"energia",apagones:"energia",
 agua:"agua",acueducto:"agua",riego:"agua",dique:"agua",saneamiento:"agua",
 clima:"clima",erosion:"clima",adaptacion:"clima",manglares:"clima",residuos:"clima",
 formalizacion:"reglas",tramites:"reglas",regulacion:"reglas",ventanilla:"reglas",informalidad:"reglas",
 credito:"credito",financiamiento:"credito",garantias:"credito",mipyme:"credito",emprendimiento:"credito",
 formacion:"formacion",talento:"formacion",bilinguismo:"formacion",competencias:"formacion",aprendices:"formacion",
 empleo:"brechas",pobreza:"brechas",inclusion:"brechas",ruralidad:"brechas",barrios:"brechas",equidad:"brechas",
 instituciones:"instituciones",gobernanza:"instituciones",coordinacion:"instituciones",ejecucion:"instituciones",transparencia:"instituciones"};
const MIN_FUERA=3;   // menciones minimas para que entre una palabra que no esta en el nucleo
const VACIAS=new Set("para pero como este esta esto esos esas aqui alli donde cuando porque sobre entre desde hasta cada todo toda todos todas muy mas menos algo nada otro otra segun ante bajo tras solo tambien nuestro nuestra sera seria hacer tener poder deber estar haber".split(" "));
const sinTildes=t=>String(t||"").toLowerCase().normalize("NFD").replace(new RegExp("["+String.fromCharCode(768)+"-"+String.fromCharCode(879)+"]","g"),"").trim();
const palabraOk=w=>w.length>=4&&!VACIAS.has(w)&&/^[a-zñ]+$/.test(w);
const FAMPAL={conectividad:"t",energia:"t",agua:"t",clima:"t",reglas:"e",credito:"e",formacion:"e",brechas:"g",instituciones:"g"};
/* las palabras de impacto de una voz, sin repetir. La nube muestra solo lo que la gente dijo:
   si una voz no trae palabras, no se le inventa ninguna. */
const palabrasDe=d=>{
  const p=(Array.isArray(d.palabras)?d.palabras:[]).map(w=>String(w||"").toLowerCase().trim()).filter(w=>palabraOk(sinTildes(w)));
  const vistas={},fuera=[];
  p.forEach(w=>{const k=sinTildes(w);if(!vistas[k]){vistas[k]=1;fuera.push(w)}});
  return fuera;
};
/* ===== Las 60 organizaciones invitadas =====
   Cada fila es [nombre oficial, sigla del escudo, otras formas de escribirlo].
   Sirve para que "CCC", "la camara" y "Camara de Comercio de Cartagena" sean
   la misma organizacion y no tres escudos distintos en la nube. */
const ORGS=[
["Cámara de Comercio de Cartagena","CCC",["ccc", "camara de comercio", "camara comercio cartagena", "la camara", "camara de comercio cartagena"]],
["Consejo Gremial de Bolívar","CGB",["cgb", "consejo gremial", "consejo gremial bolivar"]],
["Congresistas de Bolívar","CB",["congresista", "congreso bolivar", "bancada de bolivar", "bancada bolivar"]],
["Alcaldía de Cartagena de Indias","ALC",["alcaldia", "alcaldia de cartagena", "distrito de cartagena", "distrito"]],
["Gobernación de Bolívar","GOB",["gobernacion", "gobernacion de bolivar", "departamento de bolivar"]],
["ACOPI Bolívar","ACO",["acopi"]],
["Afinia Grupo EPM","AFI",["afinia", "grupo epm", "epm"]],
["ANATO Noroccidente","ANA",["anato"]],
["Asociación Náutica de Colombia","ANC",["asonautica", "asociacion nautica", "nautica de colombia"]],
["ANDI Más País (Seccional Bolívar)","ANDI",["andi", "andi bolivar", "andi mas pais"]],
["ASOTELCA","ASO",["asotelca"]],
["CAMACOL Bolívar","CAM",["camacol"]],
["Convention & Visitors Bureau","CVB",["cvb", "convention bureau", "visitors bureau", "convention and visitors bureau", "bureau"]],
["Comfenalco","CMF",["comfenalco", "comfenalco cartagena"]],
["Cotelco","COT",["cotelco", "cotelco bolivar"]],
["Fenalco Bolívar","FEN",["fenalco"]],
["FENDIPETROLEO","FDP",["fendipetroleo", "fendipetroleo bolivar"]],
["FITAC","FTC",["fitac"]],
["Fundación Santo Domingo","FSD",["fsd", "santo domingo", "fundacion santo domingo"]],
["Fundación Serena del Mar","FSM",["serena del mar", "fundacion serena"]],
["Fundación Tenaris TuboCaribe","FTT",["tenaris", "tubocaribe", "tenaris tubocaribe"]],
["Grupo Argos Fundación","GAF",["fundacion grupo argos", "argos fundacion"]],
["Lonja de Propiedad Raíz","LPR",["lonja", "lonja de propiedad raiz", "la lonja"]],
["Ruta Costera | Isa VÍAS","RC",["ruta costera", "isa vias", "isa"]],
["SIAB","SIA",["siab"]],
["Sociedad de Mejoras Públicas","SMP",["smp", "sociedad de mejoras", "mejoras publicas"]],
["Undetco","UND",["undetco"]],
["Agrem","AGR",["agrem"]],
["Acodrés","ACD",["acodres"]],
["Fundación Centro Histórico","FCH",["centro historico", "fundacion centro historico"]],
["Analdex","ANX",["analdex"]],
["Agentucol","AGT",["agentucol"]],
["Amcham Cartagena","AMC",["amcham", "camara colombo americana"]],
["Asonav","ASN",["asonav"]],
["Traso","TRA",["traso"]],
["Fundación Grupo Social","FGS",["grupo social", "fundacion grupo social"]],
["Riescar (Universidades Cartagena)","RIE",["riescar", "universidades de cartagena"]],
["Asiesca (Universidades Caribe)","ASI",["asiesca", "universidades del caribe"]],
["Basc","BSC",["basc", "basc caribe"]],
["Cámara Marítima Colombiana","CMC",["camara maritima", "camara maritima colombiana", "camara maritica"]],
["Armcol","ARM",["armcol"]],
["Círculo de Obreros","CDO",["circulo de obreros"]],
["CCI","CCI",["cci", "camara colombiana de infraestructura"]],
["Funcicar","FUN",["funcicar"]],
["Cartagena Cómo Vamos","CCV",["cartagena como vamos", "como vamos"]],
["Comisión Regional de Competitividad","CRC",["crc", "comision regional", "comision regional de competitividad e innovacion", "crci"]],
["Invest In Cartagena & Bolívar","INV",["invest in cartagena", "invest", "invest in cartagena y bolivar"]],
["Comité Intergremial del Atlántico","CIA",["comite intergremial", "intergremial del atlantico"]],
["CTP Cartagena","CTP",["ctp", "consejo territorial de planeacion"]],
["RAP Caribe","RAP",["rap", "rap caribe", "region administrativa"]],
["CUEE","CUE",["cuee", "comite universidad empresa estado"]],
["Fundación Puerto de Cartagena","FPC",["fundacion puerto de cartagena", "fundacion puerto"]],
["Sacyr","SAC",["sacyr"]],
["Oinac","OIN",["oinac"]],
["Odinsa","ODI",["odinsa"]],
["Puerto de Cartagena","PDC",["puerto de cartagena", "grupo puerto de cartagena", "sociedad portuaria"]],
["Refinería","REF",["refineria", "refineria de cartagena", "reficar", "ecopetrol"]],
["Cementos Argos","ARG",["argos", "cementos argos"]],
["PDP Canal del Dique","PDP",["pdp", "canal del dique", "pdp canal del dique"]],
["Diálogo Social","DS",["dialogo social"]]];

/* Los logos reales viven en logos.js, que se carga antes que este archivo.
   Ahi LOGOS["<nombre oficial>"] = {d:"data:image/...", o:0|1}, donde o=1
   marca los logos claros, que necesitan fondo oscuro para verse.
   Si logos.js no esta, todas las organizaciones usan el escudo de sigla. */

/* indice de busqueda, de la clave mas larga a la mas corta para que
   "fundacion puerto de cartagena" gane sobre "puerto de cartagena" */
const normOrg=t=>sinTildes(t).replace(/[^a-z0-9ñ ]/g," ").replace(/\s+/g," ").trim();
const ORGIDX=(()=>{const m=new Map();
  ORGS.forEach((o,i)=>{m.set(normOrg(o[0]),i);o[2].forEach(a=>{const k=normOrg(a);if(!m.has(k))m.set(k,i)})});
  return [...m.entries()].sort((a,b)=>b[0].length-a[0].length)})();
/* Una organizacion se reconoce solo cuando no hay duda: su nombre o una de sus formas,
   completo, y a lo sumo rodeado de estas palabras de relleno o de lugar
   ("la Camara de Comercio de Cartagena", "ANDI seccional Bolivar").
   Asi "Camara de Comercio de Bogota" o "Gobernacion del Atlantico" no se confunden con
   las de la lista: un logo equivocado en pantalla es peor que un escudo de iniciales. */
const RELLENO=new Set("la el los las de del y e en cartagena bolivar indias seccional regional capitulo colombia sa sas".split(" "));
const cacheOrg=new Map();
function buscaOrg(txt){
  const n=normOrg(txt);
  if(!n)return -1;
  if(cacheOrg.has(n))return cacheOrg.get(n);
  let r=-1;
  for(const [k,i] of ORGIDX){if(n===k){r=i;break}}
  if(r<0){const t=" "+n+" ";
    for(const [k,i] of ORGIDX){const x=t.indexOf(" "+k+" ");if(x<0)continue;
      const resto=(t.slice(0,x)+" "+t.slice(x+k.length+2)).split(" ").filter(Boolean);
      if(resto.every(w=>RELLENO.has(w))){r=i;break}}}
  cacheOrg.set(n,r);return r;
}
/* colores del escudo: los de la paleta que aguantan texto blanco encima */
const COLORES=["#073A56","#017C9C","#E0691B","#14618B","#B2531A","#0E4A6B"];
function escudo(org){
  const i=buscaOrg(org),o=i>=0?ORGS[i]:null;
  const nombre=o?o[0]:String(org||"?");
  const clave=o?o[0]:sinTildes(org);
  const lg=(typeof LOGOS!=="undefined")&&LOGOS[clave];
  if(lg)return `<img class="lg${lg.o?" osc":""}" src="${lg.d}" alt="${esc(nombre)}" title="${esc(nombre)}">`;
  const ini=o?o[1]:(String(org||"?").split(/\s+/).filter(x=>x.length>2).slice(0,2).map(x=>x[0].toUpperCase()).join("")||String(org||"?").slice(0,2).toUpperCase());
  const n=sinTildes(nombre)||"?";
  let h=0;for(let j=0;j<n.length;j++)h=(h*31+n.charCodeAt(j))>>>0;
  const fs=ini.length>=4?9.5:ini.length===3?11:12.5;
  return `<b style="background:${COLORES[h%COLORES.length]};font-size:${fs}px" title="${esc(nombre)}">${esc(ini)}</b>`;
}
/* lista de organizaciones que hablaron, con su escudo y cuántas voces aportó cada una.
   Se despliega al hacer clic en el indicador de organizaciones. */
function pintaOrgs(T){
  const caja=$v("#vzOrgs"); if(!caja)return;
  if(!orgAbierta){caja.hidden=true;caja.innerHTML="";return}
  const cuenta=new Map();
  T.forEach(d=>{const n=nombreOrg(d.organizacion); if(!n)return;
    cuenta.set(n,(cuenta.get(n)||0)+1)});
  const filas=[...cuenta.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"es"));
  caja.hidden=false;
  caja.innerHTML=`<p class="vz-orgs-t">Las ${filas.length} organizaciones que ya dejaron su voz</p>`+
    `<div class="vz-escudos">`+filas.map(([n,c])=>
      `<span class="vz-esc">${escudo(n)}<span>${esc(n)}</span><em>${c}</em></span>`).join("")+`</div>`;
}

/* el nombre que se proyecta: el oficial cuando la organizacion esta en la lista */
function nombreOrg(org){const i=buscaOrg(org);return i>=0?ORGS[i][0]:String(org||"")}
let filPalabra=null;
let orgAbierta=false;   /* la lista de organizaciones que hablaron, desplegada o no */
let secAbierta=["nube","analisis","arbol"].indexOf(VOZ_Q.get("seccion"))>=0?VOZ_Q.get("seccion"):"nube";   // nube | analisis | arbol

/* ===== ÁRBOL DE LOGOS =====
   Un tablero con las organizaciones que ya hablaron. La Cámara de Comercio va
   siempre arriba y más grande; las demás bajan por número de voces.
   Tres formas: pirámide por niveles, árbol ramificado y burbujas.
   El tamaño crece con la RAÍZ del número de voces: si creciera con el número
   directo, una organización con catorce voces quedaría catorce veces más
   grande que una con una sola y el tablero se desbalancearía. */
const ARB_CCC="Cámara de Comercio de Cartagena";
const ARB_W=1180;
let arbForma=["piramide","ramas","burbujas"].indexOf(VOZ_Q.get("forma"))>=0?VOZ_Q.get("forma"):"piramide";

function arbDatos(T){
  const c=new Map();
  T.forEach(d=>{const n=nombreOrg(d.organizacion); if(!n)return; c.set(n,(c.get(n)||0)+1)});
  const o=[...c.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"es"));
  const i=o.findIndex(x=>x[0]===ARB_CCC); if(i>0)o.unshift(o.splice(i,1)[0]);
  return o;
}
function arbCorto(n){return n.replace(/\s*\(.*\)/,"")}
function arbFicha(nom,n,alto,conEt){
  const j=buscaOrg(nom), o=j>=0?ORGS[j]:null;
  const L=(typeof LOGOS!=="undefined")&&LOGOS[o?o[0]:nom];
  const ancho=Math.round(alto*1.6);
  const ini=o?o[1]:arbCorto(nom).slice(0,3).toUpperCase();
  const dentro=L?`<img src="${L.d}" alt="${esc(nom)}">`
               :`<b style="font-size:${Math.round(alto*.30)}px">${esc(ini)}</b>`;
  const cl="arb-chapa"+((L&&L.o)||!L?" osc":"");
  let h=0,t=sinTildes(nom);for(let k=0;k<t.length;k++)h=(h*31+t.charCodeAt(k))>>>0;
  const est=L?"":`background:${COLORES[h%COLORES.length]};`;
  return `<span class="arb-hoja" title="${esc(nom)} · ${n} ${n===1?"voz":"voces"}">
    <span class="${cl}" style="${est}width:${ancho}px;height:${alto}px">${dentro}</span>
    ${conEt?`<span class="et">${esc(arbCorto(nom))}</span><span class="n">${n}</span>`:""}</span>`;
}
function arbPiramide(o){
  const filas=[[o[0]]]; let i=1,cap=2;
  while(i<o.length){filas.push(o.slice(i,i+cap));i+=cap;cap=Math.min(cap+1,7)}
  return `<div class="arb-escena" style="width:${ARB_W}px">`+filas.map((f,k)=>{
    const alto=k===0?126:Math.max(38,Math.round(108-k*12));
    return `<div class="arb-fila">`+f.map(x=>arbFicha(x[0],x[1],alto,alto>=54)).join("")+`</div>`
  }).join("")+`</div>`;
}
function arbRamas(o,oscuro){
  const niv=[]; let i=0,cap=1;
  while(i<o.length){niv.push(o.slice(i,i+cap));i+=cap;cap=Math.min(cap+1,7)}
  const alt=niv.map((_,k)=>k===0?120:Math.max(36,Math.round(102-k*12)));
  const ys=[]; let y=alt[0]/2+10;
  niv.forEach((f,k)=>{ys.push(y); y+=alt[k]+(alt[k]>=54?52:26)+(k<niv.length-1?18:0)});
  const H=Math.round(y+30), pos=[];
  niv.forEach((f,k)=>{
    const abre=Math.min(ARB_W-160,150+(ARB_W-300)*(k/Math.max(1,niv.length-1)));
    f.forEach((x,j)=>{const cx=f.length===1?ARB_W/2:(ARB_W/2-abre/2)+abre*(j/(f.length-1));
      pos.push({x:cx,y:ys[k],h:alt[k],nom:x[0],n:x[1],k})});
  });
  const trazo=oscuro?"#1E6C8F":"#C3D8E1"; let ramas="";
  pos.forEach(p=>{ if(p.k===0)return;
    const arr=pos.filter(q=>q.k===p.k-1); let m=arr[0],d=1e9;
    arr.forEach(q=>{const dd=Math.abs(q.x-p.x);if(dd<d){d=dd;m=q}});
    const y1=m.y+m.h/2,y2=p.y-p.h/2,mid=(y1+y2)/2;
    ramas+=`<path d="M ${m.x} ${y1} C ${m.x} ${mid}, ${p.x} ${mid}, ${p.x} ${y2}" fill="none" stroke="${trazo}" stroke-width="${Math.max(1.5,4.5-p.k*.5)}" stroke-linecap="round"/>`;
  });
  return `<div class="arb-escena arb-ram" style="width:${ARB_W}px;height:${H}px">
    <svg viewBox="0 0 ${ARB_W} ${H}" width="${ARB_W}" height="${H}">${ramas}</svg>`+
    pos.map(p=>`<span class="arb-pin" style="left:${p.x}px;top:${p.y}px">${arbFicha(p.nom,p.n,p.h,p.h>=50)}</span>`).join("")+`</div>`;
}
function arbColoca(o,R,H){
  const it=o.map(x=>({nom:x[0],n:x[1],r:R(x[1])}));
  it[0].x=ARB_W/2; it[0].y=it[0].r+18;
  const p=[it[0]];
  for(let i=1;i<it.length;i++){
    const c=it[i]; let rad=it[0].r+c.r+14, ang=Math.PI/2, k=0;
    while(k<20000){
      const x=ARB_W/2+Math.cos(ang)*rad*1.28, yy=it[0].y+Math.sin(ang)*rad*0.86;
      if(x-c.r>8&&x+c.r<ARB_W-8&&yy-c.r>8&&yy+c.r<H-8&&
         p.every(q=>Math.hypot(q.x-x,q.y-yy)>=q.r+c.r+8)){c.x=x;c.y=yy;break}
      ang+=0.16; if(ang>Math.PI*2.5){ang=Math.PI/2;rad+=7} k++;
    }
    if(c.x==null){c.x=-999;c.y=-999}
    p.push(c);
  }
  return p;
}
function arbBurbujas(o){
  const max=o[0][1], H=780;
  /* Si a tamaño completo no caben, todas las burbujas se achican por igual hasta que
     quepan: ninguna organización que habló puede quedarse por fuera del tablero. */
  const R0=n=>33+77*Math.sqrt(n)/Math.sqrt(max);
  const area=o.reduce((s,x)=>s+Math.PI*Math.pow(R0(x[1])+4,2),0);
  let f=Math.min(1,Math.sqrt(.42*ARB_W*H/area)),p;
  for(let intento=0;intento<8;intento++,f*=.9){
    const fz=f; p=arbColoca(o,n=>Math.round(R0(n)*fz),H);
    if(p.every(q=>q.x>0))break;
  }
  return `<div class="arb-escena arb-bur" style="width:${ARB_W}px;height:${H}px">`+
    p.filter(q=>q.x>0).map(q=>{
      const j=buscaOrg(q.nom),oo=j>=0?ORGS[j]:null;
      const L=(typeof LOGOS!=="undefined")&&LOGOS[oo?oo[0]:q.nom];
      const ini=oo?oo[1]:arbCorto(q.nom).slice(0,3).toUpperCase();
      const dentro=L?`<img src="${L.d}" alt="${esc(q.nom)}">`:`<b style="font-size:${Math.round(q.r*.44)}px">${esc(ini)}</b>`;
      const cl="arb-glob"+((L&&L.o)||!L?" osc":"");
      let h=0,t=sinTildes(q.nom);for(let k=0;k<t.length;k++)h=(h*31+t.charCodeAt(k))>>>0;
      const est=L?"":`background:${COLORES[h%COLORES.length]};`;
      const et=q.r>=58?`<span class="et">${esc(arbCorto(q.nom).slice(0,24))}<br>${q.n}</span>`:"";
      return `<div class="${cl}" style="${est}left:${q.x}px;top:${q.y}px;width:${q.r*2}px;height:${q.r*2}px" title="${esc(q.nom)} · ${q.n}">${dentro}${et}</div>`;
    }).join("")+`</div>`;
}
function arbDibuja(o,oscuro){
  if(!o.length)return `<p class="arb-vacio">Todavía no ha hablado nadie. El árbol se arma solo a medida que llegan las voces.</p>`;
  return arbForma==="ramas"?arbRamas(o,oscuro):arbForma==="burbujas"?arbBurbujas(o):arbPiramide(o);
}
function arbEncaja(caja){
  const e=caja.querySelector(".arb-escena"); if(!e){caja.style.height="";return}
  const k=Math.min(1.9,Math.max(.3,(caja.clientWidth-30)/ARB_W));
  e.style.transform=`scale(${k})`; e.style.transformOrigin="top center";
  /* la escena va escalada, así que no ocupa espacio propio: hay que darle la
     altura a la caja a mano, y volver a medirla cuando terminen de cargar los logos */
  const fija=()=>{caja.style.height=Math.ceil(e.getBoundingClientRect().height+18)+"px"};
  fija();
  [...e.querySelectorAll("img")].forEach(im=>{if(!im.complete)im.addEventListener("load",fija,{once:true})});
  setTimeout(fija,250); setTimeout(fija,900);
}
function pintaArbol(T){
  const caja=$v("#vzArbol"), man=$v("#vzArbMandos");
  if(!caja||!man)return;
  const o=arbDatos(T);
  man.innerHTML=[["piramide","Pirámide"],["ramas","Ramificado"],["burbujas","Burbujas"]]
    .map(([k,t])=>`<button type="button" class="sug${arbForma===k?" on":""}" data-f="${k}">${t}</button>`).join("")+
    `<button type="button" class="sug acc" id="vzArbProy">Proyectar en otra ventana</button>`;
  man.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{arbForma=b.dataset.f;pinta()});
  const pr=$v("#vzArbProy"); if(pr)pr.onclick=arbProyecta;
  caja.innerHTML=arbDibuja(o,false);
  arbEncaja(caja);
  arbUlt=o;
  arbRepintaVentana();   // la ventana aparte sigue a los datos nuevos y a la forma elegida
}
addEventListener("resize",()=>{const c=$v("#vzArbol"); if(c&&c.offsetParent)arbEncaja(c)});

/* ventana aparte, solo con el árbol, para proyectar. Se redibuja en cada refresco del panel. */
let arbUlt=[],arbVentana=null;
function arbRepintaVentana(){
  const w=arbVentana; if(!w||w.closed)return;
  const c=w.document&&w.document.getElementById("caja"); if(!c)return;
  c.innerHTML='<p class="arb-tit">Quién habló en la Junta de Juntas</p>'+arbDibuja(arbUlt,true);
  const e=c.querySelector(".arb-escena"); if(!e)return;
  const k=Math.min((w.innerWidth-60)/ARB_W,(w.innerHeight-120)/(e.offsetHeight||600),2.2);
  e.style.transform="scale("+Math.max(.3,k)+")"; e.style.transformOrigin="top center";
  c.style.height=Math.ceil((e.offsetHeight||600)*Math.max(.3,k)+20)+"px";
}
function arbProyecta(){
  const w=window.open("","arbolVoz","width=1600,height=900");
  if(!w){alert("El navegador bloqueó la ventana. Permita las ventanas emergentes para esta página.");return}
  const css=[...document.querySelectorAll("style")].map(s=>s.textContent).join("\n");
  w.document.open();
  w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8">'+
   '<title>Árbol de logos · La voz de la Junta</title>'+
   '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">'+
   '<style>'+css+'\n'+
   'body{margin:0;background:#073A56;min-height:100vh;display:flex;flex-direction:column;justify-content:center}'+
   '#v-voz{display:block}'+
   '.arb-tit{font-family:Archivo,sans-serif;font-size:18px;letter-spacing:.18em;text-transform:uppercase;color:#9EC4D6;text-align:center;margin:0 0 26px}'+
   '.arb-hoja .et{font-size:13px;max-width:170px;color:#B9D2DF}'+
   '.arb-hoja .n{font-size:12.5px;color:#F8A432}'+
   '.arb-bur .et{font-size:12px;color:#B9D2DF}'+
   '</style></head><body><div id="v-voz"><div class="arb-marco" id="caja"></div></div></body></html>');
  w.document.close();
  arbVentana=w;
  setTimeout(arbRepintaVentana,160);
  w.addEventListener("resize",()=>setTimeout(arbRepintaVentana,80));
}


/* DATOS DE PRUEBA — frases inventadas para ver el panel antes del evento.
   Las organizaciones sí son de la lista de invitados, para probar los escudos.
   Ninguna de estas voces es real. */
const DEMO_PAL={conectividad:["puerto","vías"],energia:["energía","tarifas"],agua:["agua","riego"],clima:["clima","adaptación"],reglas:["trámites","formalización"],credito:["crédito","mipyme"],formacion:["talento","bilingüismo"],brechas:["empleo","barrios"],instituciones:["ejecución","coordinación"]};
const D=(m,n,o,p,s,t,f,a)=>({momento:m,nombre:n,organizacion:o,palanca:p,sector:s,texto:t||"",audio:a!==0,validada:n.length%3===0,palabras:(DEMO_PAL[p]||[]).slice(0,1+n.length%2)});
const DEMO=[
D(1,"Laura","ANDI Más País (Seccional Bolívar)","energia","industria","Que Cartagena sea un hub industrial y no solo turístico: con energía confiable, Mamonal puede duplicar su empleo formal."),
D(1,"Andrés","Puerto de Cartagena","conectividad","comext","Que el puerto se conecte por tren y doble calzada con el interior del país."),
D(1,"Marcela","Cotelco","conectividad","turismo","Un aeropuerto a la altura de los visitantes que ya tenemos."),
D(1,"Jorge","Agrem","agua","agro","Riego para Montes de María: el agua para producir no es la misma que el agua para vivir.",0,1),
D(1,"Diana","Fundación Santo Domingo","brechas","hogares","Que el crecimiento llegue a los barrios que no ven el puerto."),
D(1,"Camilo","Cámara Marítima Colombiana","reglas","maritimo","Que los astilleros de Cartagena compitan con Panamá, con reglas reglamentadas y trámites cortos."),
D(1,"Paola","Riescar (Universidades Cartagena)","formacion","desemp","Técnicos formados para lo que pide el puerto, el turismo y la industria."),
D(1,"Ricardo","Fenalco Bolívar","reglas","desemp","Un camino de formalización por etapas para el pequeño comercio.",0,1),
D(1,"Sofía","Afinia Grupo EPM","energia","energia","Aprovechar el viento y el sol del Caribe con conexión a tiempo a la red."),
D(1,"Hernán","Invest In Cartagena & Bolívar","credito","desemp","Crédito que llegue a la mipyme de Bolívar y no se quede en Bogotá."),
D(1,"Natalia","PDP Canal del Dique","clima","hogares","Una ciudad que se anticipa al mar y a las lluvias, no que reacciona."),
D(1,"Felipe","FITAC","conectividad","comext","Accesos portuarios que no dependan de una sola vía urbana."),
D(1,"Isabel","SIAB","agua","agro","Distritos de riego que funcionen y centros de acopio cerca del productor.",0,1),
D(1,"Tomás","CAMACOL Bolívar","instituciones","hogares","Instituciones regionales con capacidad de ejecutar, con respaldo de la Nación."),
D(2,"Laura","ANDI Más País (Seccional Bolívar)","energia","industria","Compartir los datos de consumo y costo energético de nuestros afiliados para sostener el argumento ante el DNP."),
D(2,"Andrés","Puerto de Cartagena","conectividad","comext","Acompañar la ficha técnica de los accesos portuarios con nuestras cifras de carga."),
D(2,"Marcela","Cotelco","formacion","turismo","Abrir 40 plazas de práctica en hoteles para jóvenes de bachillerato técnico."),
D(2,"Camilo","Cámara Marítima Colombiana","reglas","maritimo","Entregar las 26 recomendaciones de la ley de fomento con su norma de soporte."),
D(2,"Paola","Riescar (Universidades Cartagena)","formacion","desemp","Poner a disposición un grupo de investigación para medir la pertinencia de la oferta."),
D(2,"Hernán","Invest In Cartagena & Bolívar","credito","desemp","Diseñar con la Cámara una línea piloto para empresas recién formalizadas.",0,1),
D(2,"Natalia","PDP Canal del Dique","clima","hogares","Aportar la cartografía de riesgo que ya tenemos levantada."),
D(2,"Sofía","Afinia Grupo EPM","energia","energia","Reportar las solicitudes de conexión represadas para que el dato sea público."),
D(2,"Diana","Fundación Santo Domingo","brechas","hogares","Conectar nuestros programas de empleabilidad con la agenda de la Junta."),
];
const RESERVA=[
D(1,"Julián","Gremio de transporte","conectividad","comext","El Canal del Dique y el río como corredor de carga."),
D(1,"Valentina","Emprendimiento digital","formacion","desemp","Cartagena como sede de servicios globales, con bilingüismo de verdad.",0,1),
D(2,"Julián","Gremio de transporte","conectividad","comext","Compartir los aforos de carga del corredor Mamonal."),
D(1,"Álvaro","Gremio agroindustrial","agua","agro","Transformar aquí lo que se cosecha aquí."),
D(2,"Valentina","Emprendimiento digital","formacion","desemp","Mentorías para 20 emprendimientos de base tecnológica."),
D(1,"Carolina","Caja de compensación","brechas","hogares","Que el empleo formal crezca donde más falta hace.",0,1),
D(2,"Carolina","Caja de compensación","brechas","hogares","Cruzar nuestros datos de afiliación con el censo empresarial.")
];

let datos=[],modo="prueba",ultimaDemo=null,ult=null,filMom=0,filPal=null,reserva=RESERVA.slice();
let motor=null,firma="",pidiendo=false,ultimoRespaldo=0,respaldando=false,errorClave=false,guardadoEn=null,opMsg={t:0,txt:""};
const $v=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const vistasMuro=new Set();
const hora=d=>d.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});
const haceTxt=ms=>{const s=Math.max(0,Math.round(ms/1000));return s<90?s+" s":Math.round(s/60)+" min"};

function estado(){const e=$v("#vzEstado");e.className="vz-estado "+(modo==="clave"?"caido":modo);
  e.lastElementChild.textContent=
    modo==="cargando"?"Conectando…"+(guardadoEn?" · mostrando lo guardado a las "+hora(guardadoEn):""):
    modo==="vivo"?"En vivo · actualizado "+hora(ult):
    modo==="clave"?"Clave del panel incorrecta · revise ?clave= en la dirección":
    modo==="caido"?"Sin conexión · mostrando lo último"+(ult?" ("+hora(ult)+")":guardadoEn?" guardado ("+hora(guardadoEn)+")":""):
    "Datos de prueba · no son respuestas reales";}

function pinta(){
  estado();
  const T=datos, V=datos.filter(d=>!d.procesando&&!d.fallida&&palN[d.palanca]);
  const proc=datos.filter(d=>d.procesando).length;
  const F=V.filter(d=>!filMom||+d.momento===filMom);
  const orgs=new Set(T.map(d=>sinTildes(nombreOrg(d.organizacion))).filter(Boolean));
  // momentos
  const M=$v("#vzMom");M.innerHTML="";
  /* cada momento con su color de la paleta: todo marino, visión petróleo, compromiso naranja */
  [[0,"Todo","m-todo"],[1,"Visión","m-vision"],[2,"Compromiso","m-compromiso"]].forEach(([k,t,cl])=>{const b=document.createElement("button");b.className="sug "+cl+(k===filMom?" on":"");b.type="button";
    b.textContent=t+" ("+(k?T.filter(d=>+d.momento===k).length:T.length)+")";b.onclick=()=>{filMom=k;pinta()};M.appendChild(b)});
  // kpis
  /* tres indicadores, cada uno con su color de la paleta */
  const nVis=T.filter(d=>+d.momento===1).length, nCom=T.filter(d=>+d.momento===2).length;
  /* el tercer indicador sigue al filtro: en Todo muestra visión y compromiso,
     y al elegir uno de los dos se queda solo con ese */
  const terc = filMom===1
      ? `<div class="num">${nVis}</div><div class="lab">visiones recogidas</div>`
    : filMom===2
      ? `<div class="num">${nCom}</div><div class="lab">compromisos concretos</div>`
      : `<div class="dosnum"><span><b>${nVis}</b><i>visiones</i></span><span><b>${nCom}</b><i>compromisos</i></span></div><div class="lab">lo que la sala imaginó y lo que se comprometió a hacer</div>`;
  $v("#vzKpis").innerHTML=
    `<div class="kpi k-marino"><div class="num">${T.length}</div><div class="lab">${proc?`voces recibidas · ${proc} transcribiéndose`:"voces recibidas, transcritas y ubicadas"}</div></div>`+
    `<button class="kpi k-petroleo kpi-btn${orgAbierta?" on":""}" type="button" id="vzKpiOrg" aria-expanded="${orgAbierta}">`+
      `<div class="num">${orgs.size}</div><div class="lab">organizaciones que hablaron</div>`+
      `<span class="kpi-pista">${orgAbierta?"ocultar la lista":"clic para ver cuáles"}</span></button>`+
    `<div class="kpi k-naranja">${terc}</div>`;
  $v("#vzKpiOrg").onclick=()=>{orgAbierta=!orgAbierta;pinta()};
  pintaOrgs(T);
  pintaArbol(T);
  // palancas
  const cnt={},org={};PAL.forEach(p=>{cnt[p[0]]=0;org[p[0]]=new Set()});
  F.forEach(d=>{cnt[d.palanca]++;if(d.organizacion)org[d.palanca].add(nombreOrg(d.organizacion))});
  const mx=Math.max(1,...Object.values(cnt));
  const P=$v("#vzPal");P.innerHTML="";let fam="";
  PAL.forEach(([id,nom,f])=>{
    if(f!==fam){fam=f;const h=document.createElement("div");h.className="vz-fam";h.textContent=FAM[f];P.appendChild(h)}
    /* solo el conteo: con 60 organizaciones, listar nombres satura la columna */
    const o=org[id].size,os=o?o+(o===1?" organización":" organizaciones"):"nadie todavía";
    const b=document.createElement("button");b.type="button";b.className="vz-pal"+(filPal===id?" on":"");
    b.innerHTML=`<b>${esc(nom)}</b><span class="bar"><i class="f-${f}" style="width:${cnt[id]/mx*100}%"></i></span><span class="n">${cnt[id]}</span><span class="orgs">${os}</span>`;
    b.onclick=()=>{filPal=filPal===id?null:id;pinta()};P.appendChild(b)});
  // matriz
  const mm={};let mmx=1;F.forEach(d=>{const k=d.palanca+"|"+d.sector;mm[k]=(mm[k]||0)+1;mmx=Math.max(mmx,mm[k])});
  /* cada fila toma el color de su familia: territorio petróleo, empresas naranja, gente ámbar.
     Las celdas vacías van en crema. Así la matriz usa la paleta entera y se lee por bloques. */
  const TINTA={t:"var(--p1)",e:"var(--inv)",g:"var(--p2)"};
  $v("#vzMat").innerHTML="<tr><th></th>"+SECT.map(s=>`<th title="${esc(s[1])}">${esc(s[2])}</th>`).join("")+"</tr>"+
    PAL.map(([id,nom,f])=>"<tr><th class='r'>"+esc(nom)+"</th>"+SECT.map(([s])=>{const n=mm[id+"|"+s]||0;
      if(!n)return"<td class='z' style='background:var(--mono)'>·</td>";const pct=Math.round(25+75*n/mmx);
      return`<td style="background:color-mix(in srgb,${TINTA[f]} ${pct}%,var(--sup));color:${pct>55?"#fff":"var(--ink)"}">${n}</td>`}).join("")+"</tr>").join("");
  // secciones: una a la vez, para que la vista no se vea saturada
  const SECS=[["nube","Nube de palabras"],["analisis","Palancas y voces"],["arbol","Árbol de logos"]];
  const S=$v("#vzSecs");S.innerHTML="";
  SECS.forEach(([k,t])=>{const b=document.createElement("button");b.type="button";
    b.className="sug"+(secAbierta===k?" on":"");b.textContent=t;
    b.onclick=()=>{secAbierta=k;pinta()};S.appendChild(b)});
  [...document.querySelectorAll("#v-voz .vz-sec")].forEach(el=>
    el.classList.toggle("abierta",el.dataset.sec===secAbierta));

  // nube de palabras
  /* el tamaño de cada palabra es cuántas PERSONAS la dijeron: quien la dijo en la visión y en el
     compromiso cuenta una vez */
  const cuenta={},quienes={},muestra={},personas={};
  F.forEach(d=>palabrasDe(d).forEach(w=>{
    const k=sinTildes(w),yo=sinTildes(d.nombre)+"|"+sinTildes(nombreOrg(d.organizacion));
    (personas[k]=personas[k]||new Set()).add(yo);
    cuenta[k]=personas[k].size;
    // se muestra la forma con tildes si alguien la dijo asi
    if(!muestra[k]||(w.length>=muestra[k].length&&w!==k))muestra[k]=w;
    (quienes[k]=quienes[k]||new Set()).add(nombreOrg(d.organizacion)||"Sin organización");
  }));
  const lista=Object.keys(cuenta).filter(w=>VOCAB[w]||cuenta[w]>=MIN_FUERA);
  const maxW=Math.max(1,...lista.map(w=>cuenta[w]));
  const N=$v("#vzNube");
  if(!lista.length){N.innerHTML="<p class='vz-nube-vacia'>La nube se llena sola a medida que la gente responde.</p>";}
  else{
    // orden estable: no salta en cada refresco
    const semilla=w=>{let h=0;for(let i=0;i<w.length;i++)h=(h*131+w.charCodeAt(i))>>>0;return h};
    const orden=lista.slice().sort((a,b)=>semilla(a)-semilla(b));
    const proy=document.body.classList.contains("proyectar");
    const min=proy?22:15,max=proy?104:58;
    N.innerHTML=orden.map(w=>{
      const n=cuenta[w],t=Math.round(min+(max-min)*Math.sqrt(n/maxW));
      const fam=VOCAB[w]?("w-"+FAMPAL[VOCAB[w]]):"w-otra";
      const apagada=filPalabra&&filPalabra!==w?" apagada":"";
      const on=filPalabra===w?" on":"";
      return `<button type="button" class="vz-w ${fam}${apagada}${on}" data-w="${esc(w)}" style="font-size:${t}px" title="${n} ${n===1?"persona":"personas"}">${esc(muestra[w]||w)}<i>${n}</i></button>`;
    }).join("");
    [...N.querySelectorAll(".vz-w")].forEach(b=>b.onclick=()=>{filPalabra=filPalabra===b.dataset.w?null:b.dataset.w;pinta()});
  }
  const Q=$v("#vzQuienes");
  if(filPalabra&&quienes[filPalabra]){
    const orgs=[...quienes[filPalabra]].sort((a,b)=>a.localeCompare(b,"es"));
    Q.className="vz-quienes abierta";
    Q.innerHTML=`<p><b>${esc(muestra[filPalabra]||filPalabra)}</b> · ${orgs.length} ${orgs.length===1?"organización":"organizaciones"}</p>`+
      `<div class="vz-escudos">${orgs.map(o=>`<span class="vz-esc">${escudo(o)}<span>${esc(o)}</span></span>`).join("")}</div>`;
  } else {Q.className="vz-quienes";Q.innerHTML=""}
  $v("#vzNubeT").textContent=filPalabra?"Quién dijo «"+(muestra[filPalabra]||filPalabra)+"»":"Las palabras que más se repitieron";
  $v("#vzNubeLimpiar").hidden=!filPalabra;

  // muro
  const FT=T.filter(d=>!d.fallida&&(!filMom||+d.momento===filMom));
  const W=(filPal?F.filter(d=>d.palanca===filPal):FT).slice(-12).reverse();
  $v("#vzMuroT").textContent=filPal?"Las voces · "+palN[filPal]:"Las voces más recientes";
  $v("#vzMuro").innerHTML=W.length?W.map(d=>{
    const corta=t=>{t=String(t||"");return t.length>260?t.slice(0,257).replace(/\s+\S*$/,"")+"…":t};
    let cuerpo="",pills="";
    if(d.procesando){cuerpo=`<span class="audio vz-proc">${MIC} Transcribiendo la nota de voz y ubicándola en su palanca…</span>`;pills=`<span class="pill warn">por ubicar</span>`}
    else{
      if(d.texto){cuerpo=`<q>${esc(corta(d.texto))}</q>`}
      if(d.audio)cuerpo+=`<span class="audio">${MIC} transcrita de su nota de voz</span>`;
      pills=(palN[d.palanca]?`<span class="pill g">${esc(palN[d.palanca])}</span>`:`<span class="pill bad">sin palanca</span>`)+(secN[d.sector]?`<span class="pill g">${esc(secN[d.sector])}</span>`:"")+
        `<span class="pill ${d.validada?"ok":"az"}">${d.validada?"validada":"ubicada por IA"}</span>`}
    /* solo entra con animación la tarjeta nueva (o la que acaba de ser ubicada),
       no todas en cada refresco */
    const clave=(d.id||[d.momento,d.nombre,d.organizacion].join("|"))+"|"+(d.procesando?1:0)+"|"+String(d.texto||"").slice(0,60);
    const nueva=!vistasMuro.has(clave);vistasMuro.add(clave);
    return`<article class="vz-voz m${+d.momento}${nueva?" nueva":""}"><div class="meta" style="padding:0;margin:0"><span class="tema">${MOM[d.momento]||""}</span>${pills}</div>${cuerpo}<div class="quien2"><b>${esc(d.nombre)}</b> · ${esc(d.organizacion)}</div></article>`}).join("")
    :"<p class='vz-vacio'>Todavía no hay voces en este filtro.</p>";
}

/* ===== Datos en vivo =====
   JSONP contra el Apps Script. Un pedido a la vez; si la respuesta llega tarde, se descarta sin errores.
   Los últimos datos buenos quedan guardados en este navegador: si el panel se recarga sin conexión,
   arranca con ellos. Solo se vuelve a dibujar si algo cambió. */
const GUARDA="vozPanel:"+VOZ_CONFIG.url;
function jsonp(params,ms,listo){
  const cb="vozcb"+Date.now()+Math.floor(Math.random()*1e4),s=document.createElement("script");
  let hecho=false;
  const fin=r=>{if(hecho)return;hecho=true;clearTimeout(t);window[cb]=function(){};setTimeout(()=>{try{delete window[cb]}catch(e){}},60000);s.remove();listo(r)};
  const t=setTimeout(()=>fin(null),ms);
  window[cb]=d=>fin(d||null);
  s.onerror=()=>fin(null);
  s.src=VOZ_CONFIG.url+(VOZ_CONFIG.url.includes("?")?"&":"?")+params+"&token="+encodeURIComponent(VOZ_CONFIG.token)+"&callback="+cb+"&_="+Date.now();
  document.body.appendChild(s);
}
function recibir(d,desdeGuardado){
  const voces=d.voces.filter(v=>v&&typeof v==="object");
  const f=JSON.stringify(voces);
  if(d.motor)motor=d.motor;
  if(f!==firma){firma=f;datos=voces;pinta()}else estado();
  if(!desdeGuardado){try{localStorage.setItem(GUARDA,JSON.stringify({t:Date.now(),voces:voces}))}catch(e){}}
}
function cargar(){
  if(!VOZ_CONFIG.url||pidiendo)return;
  pidiendo=true;
  jsonp("accion=datos",15000,d=>{
    pidiendo=false;
    if(d&&d.ok===false){errorClave=/autorizado/.test(String(d.error||""));modo=errorClave?"clave":"caido";estado();pintaOperador();console.warn("El panel no pudo leer los datos:",d.error);return}
    if(d&&Array.isArray(d.voces)){errorClave=false;modo="vivo";ult=new Date();recibir(d,false);pintaOperador();respaldo();return}
    modo="caido";estado();pintaOperador();
  });
}
/* Motor de respaldo: si el disparador de Apps Script no late hace más de 2,5 minutos y hay trabajo
   pendiente, el panel pide el proceso (como mucho una vez por minuto y nunca dos a la vez). */
function hayTrabajo(){return !!motor&&(motor.pendientes>0||motor.hayFichas||datos.some(d=>d.procesando))}
function disparadorQuieto(){return !!motor&&(!motor.latido||motor.ahora-motor.latido>150000)}
function respaldo(forzar){
  if(!VOZ_CONFIG.url||respaldando||!motor)return;
  if(!forzar&&(!VOZ_CONFIG.respaldo||!disparadorQuieto()||!hayTrabajo()||Date.now()-ultimoRespaldo<60000))return;
  respaldando=true;ultimoRespaldo=Date.now();pintaOperador();
  jsonp("accion=procesar",200000,d=>{respaldando=false;if(d&&d.motor)motor=d.motor;pintaOperador();if(d&&d.ok)setTimeout(cargar,500)});
}
function aviso(txt){opMsg={t:Date.now(),txt:txt};pintaOperador()}
function reintentar(){
  aviso("Pidiendo el reintento…");
  jsonp("accion=reintentar",60000,d=>{
    const n=d&&d.ok?d.devueltas:null;
    aviso(n==null?"No se pudo pedir el reintento.":n<0?"El motor está ocupado; intente en un minuto.":n+" fila"+(n===1?"":"s")+" devuelta"+(n===1?"":"s")+" a la cola.");
    if(n>0)respaldo(true)});
}
/* Barra del operador: solo en vivo y fuera del modo proyección (la sala no la ve). */
function pintaOperador(){
  const el=$v("#vzOperador");if(!el)return;
  if(!VOZ_CONFIG.url){el.hidden=true;return}
  el.hidden=false;
  let txt="",nivel="ok";
  if(errorClave){txt="La clave del panel no es la correcta. Cópiela del registro de configurar() o de Propiedades del script (PANEL_TOKEN).";nivel="mal"}
  else if(!motor){txt=modo==="vivo"?"Conectado. (Este Apps Script no informa el estado del motor: publique el Codigo.gs v3.)":"Esperando datos…";nivel=modo==="vivo"?"aviso":"ok"}
  else{
    const quieto=disparadorQuieto(),m=motor;
    const partes=[];
    partes.push(m.latido?"motor: latido hace "+haceTxt(m.ahora-m.latido):"motor: sin latido del disparador");
    partes.push(m.pendientes+" en cola");
    partes.push(m.errores+" con error");
    if(m.fallo&&m.ahora-m.fallo.cuando<600000)partes.push("última falla de Gemini hace "+haceTxt(m.ahora-m.fallo.cuando)+" ("+m.fallo.codigo+(m.fallo.detalle?": "+String(m.fallo.detalle).slice(0,90):"")+")");
    txt=partes.join(" · ");
    if(quieto&&hayTrabajo()){nivel="mal";txt+=" — el disparador no está corriendo: el panel procesa como respaldo"+(respaldando?" (trabajando…)":"")+". Revise con diagnostico() o ejecute activarMotor()."}
    else if(m.errores>0||(m.fallo&&m.ahora-m.fallo.cuando<300000))nivel="aviso";
  }
  el.className="vz-operador "+nivel;
  el.innerHTML=`<span class="vz-op-txt">${esc(txt)}</span><span class="vz-op-btns">`+
    (motor?`<button type="button" class="sug" id="vzOpProcesar"${respaldando?" disabled":""}>${respaldando?"Procesando…":"Procesar ahora"}</button>`+
    `<button type="button" class="sug" id="vzOpReintentar">Reintentar errores</button>`:"")+
    `</span><span class="vz-op-msg" id="vzOpMsg">${Date.now()-opMsg.t<15000?esc(opMsg.txt):""}</span><span class="vz-op-atajos">Atajos: 1 nube · 2 palancas · 3 árbol · P proyección · R rotar</span>`;
  const bp=$v("#vzOpProcesar");if(bp)bp.onclick=()=>respaldo(true);
  const br=$v("#vzOpReintentar");if(br)br.onclick=reintentar;
}

/* ===== Proyección ===== */
let wake=null,rotarSeg=Math.max(0,Number(VOZ_Q.get("rotar"))||0),rotarT=null;
async function pantallaEncendida(){try{if(navigator.wakeLock&&document.visibilityState==="visible"&&!wake){wake=await navigator.wakeLock.request("screen");wake.addEventListener("release",()=>{wake=null})}}catch(e){wake=null}}
function proyectar(on){
  document.body.classList.toggle("proyectar",on);
  $v("#vzProy").textContent=on?"Salir de proyección":"Modo proyección";
  try{if(on&&document.documentElement.requestFullscreen&&!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});else if(!on&&document.fullscreenElement)document.exitFullscreen().catch(()=>{})}catch(e){}
  pantallaEncendida();rotacion();pinta();
}
function rotacion(){
  clearInterval(rotarT);rotarT=null;
  if(!rotarSeg||!document.body.classList.contains("proyectar"))return;
  const S=["nube","analisis","arbol"];
  rotarT=setInterval(()=>{secAbierta=S[(S.indexOf(secAbierta)+1)%S.length];pinta()},rotarSeg*1000);
}
$v("#vzNubeLimpiar").onclick=()=>{filPalabra=null;pinta()};
$v("#vzProy").onclick=()=>proyectar(!document.body.classList.contains("proyectar"));
document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement&&document.body.classList.contains("proyectar"))proyectar(false)});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){pantallaEncendida();cargar()}});
document.addEventListener("keydown",e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target&&e.target.tagName;if(t==="INPUT"||t==="TEXTAREA"||t==="SELECT")return;
  const v=$v("#v-voz");if(!v||v.hidden)return;
  const k=e.key.toLowerCase();
  if(k==="1"||k==="2"||k==="3"){secAbierta=["nube","analisis","arbol"][+k-1];pinta()}
  else if(k==="p")proyectar(!document.body.classList.contains("proyectar"));
  else if(k==="r"){rotarSeg=rotarSeg?0:30;rotacion();aviso(rotarSeg?"Rotación cada 30 s (en proyección).":"Rotación apagada.")}
});

/* ===== Arranque ===== */
if(VOZ_CONFIG.url){
  modo="cargando";
  try{const g=JSON.parse(localStorage.getItem(GUARDA)||"null");if(g&&Array.isArray(g.voces)){guardadoEn=new Date(g.t);recibir(g,true)}}catch(e){}
  pinta();pintaOperador();cargar();
  setInterval(cargar,VOZ_CONFIG.refrescoSeg*1000);
  setInterval(()=>{pintaOperador();respaldo()},30000);
  pantallaEncendida();
}
else{datos=DEMO.slice();modo="prueba";pinta();pintaOperador();
  // simula el flujo real: llega la nota de voz, se transcribe y se ubica en su palanca
  setInterval(()=>{if(ultimaDemo&&ultimaDemo.procesando){ultimaDemo.procesando=false;pinta();return}
    if(reserva.length){ultimaDemo=Object.assign({},reserva.shift(),{procesando:true});datos.push(ultimaDemo);pinta()}},6000)}
if(VOZ_Q.get("proyectar")==="1")proyectar(true);
try{if(VOZ_Q.get("vista")==="voz"&&typeof ver==="function")ver("voz")}catch(e){}
})();
