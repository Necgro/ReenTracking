/* Test de tu archivo en el navegador: vive en este navegador y se guarda
 * solo.
 *
 * Bajo prueba:
 * - js/05 (autoGuardarCache): guarda el texto con lo que dijo la última
 *   descarga; de uno en uno y juntando los que esperan (guarda lo último);
 *   si el navegador no deja, lo dice (errorGuardar) y sigue por guardar;
 *   con «Olvidar todo» en marcha, nada.
 * - js/19 (arrLeerDelNavegador, arrRestaurarRecordados): al abrir la página
 *   sale lo guardado, sin descargar; lo guardado con el formato viejo (uno
 *   por pestaña) pasa al registro nuevo con el más reciente y se borra lo
 *   viejo; sin nada, uno vacío sin guardar; lo mal escrito se aparta y se
 *   avisa.
 * - Una sola pestaña. Con el bloqueo del navegador
 *   ocupado, la pestaña no lee ni guarda, lo dice y espera a abrirse sola;
 *   sin Web Locks, sigue como siempre.
 * - arrHayDatos y exDiasUltimaCopia (js/24).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_arranque_paso_almacen1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const elementos = {};
const elemento = id => (elementos[id] = elementos[id] || {
  id, value: "", disabled: false, hidden: false, open: false, innerHTML: "", textContent: "",
  dataset: {}, style: {}, children: [],
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(h) { this.children.push(h); }, setAttribute() {}, querySelector() { return null; },
});
const almacen = {}, senales = [];
const sb = {
  console: Object.assign({}, console, { error: () => {} }),
  document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }) },
  localStorage: { setItem: (k, v) => { almacen[k] = String(v); if (k === "reental_guardado") senales.push(String(v)); }, getItem: k => almacen[k] ?? null, removeItem: k => { delete almacen[k]; } },
  setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array, Set, Map, BigInt,
};
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "12-carga-archivos.js", "14-clasificador.js", "24-exportar.js", "19-arranque.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
const STATE = vm.runInContext("state", sb), ARR = vm.runInContext("arr", sb);

// IndexedDB de mentira (lo que usa js/03, idbOperar): un Map.
const idb = new Map();
sb.idbOperar = async (modo, operacion) => {
  let res;
  const s = {
    get: k => ({ get result() { return idb.get(k); } }),
    put: (v, k) => { idb.set(k, JSON.parse(JSON.stringify(v))); },
    delete: k => { idb.delete(k); },
    getAllKeys: () => ({ result: [...idb.keys()] }),
    getAll: () => ({ result: [...idb.values()] }),
    openCursor: () => {
      const pet = {};
      Object.defineProperty(pet, "onsuccess", { set(fn) {
        for (const [key, value] of [...idb]) { pet.result = { key, value, continue() {} }; fn(); }
        pet.result = null; fn();
      } });
      return pet;
    },
  };
  const pet = operacion(s);
  res = pet ? pet.result : undefined;
  return res;
};
const avisos = [], escritos = [], usos = [];
let falla = false;
const chipReal = sb.actualizarChipEstado;
sb.ccEsc = x => String(x ?? "");   // js/15, que este test no carga
Object.assign(sb, {
  toast: (msg, tipo) => avisos.push([tipo, msg]), log: () => {},
  renderPanel: () => {}, actualizarChipEstado: () => {}, arrPintarSeguro: () => {},
});
const escribirReal = sb.escribirArchivoNavegador;
sb.escribirArchivoNavegador = async (cache, extra) => {
  await new Promise(r => setTimeout(r, 5));
  if (falla) throw new Error("lleno");
  escritos.push({ ...extra, texto: JSON.stringify(cache) });
};
const conTx = n => { const c = sb.cacheVacia(); for (let i = 0; i < n; i++) c.transacciones.wallet_tokens.push({ hash: "0x" + i }); return c; };

(async () => {
  console.log("A) Guardar en el navegador (js/05)");
  STATE.cache = conTx(2); STATE.cacheDirty = true;
  ARR.ultimaPreparacion = { sincronizado: true, nuevas: 1, total: 2 }; STATE.sync.vault = { coincide: true };
  await sb.autoGuardarCache();
  const g = escritos[0] || {};
  assert("guarda el texto con lo que dijo la última descarga y su hora", JSON.parse(g.texto).transacciones.wallet_tokens.length === 2 &&
    g.prep.nuevas === 1 && g.vault.coincide === true && typeof g.cuando === "number", g);
  assert("queda guardado, sin señales a otras pestañas (A1: hay una sola)", !STATE.cacheDirty && !STATE.errorGuardar && senales.length === 0, senales);

  escritos.length = 0;
  const a = sb.autoGuardarCache();                         // empieza a escribir
  await new Promise(r => setTimeout(r, 0));
  STATE.cache.transacciones.wallet_tokens.push({ hash: "0xb" });
  const b = sb.autoGuardarCache(), c = sb.autoGuardarCache();   // esperan juntos
  STATE.cache.transacciones.wallet_tokens.push({ hash: "0xc" });
  await Promise.all([a, b, c]);
  assert("de uno en uno; los que esperan, en uno solo y con lo último", escritos.length === 2 &&
    JSON.parse(escritos[1].texto).transacciones.wallet_tokens.length === 4, escritos.map(e => JSON.parse(e.texto).transacciones.wallet_tokens.length));

  escritos.length = 0; falla = true; STATE.cacheDirty = true;
  await sb.autoGuardarCache();
  assert("si el navegador no deja: lo dice y sigue por guardar", STATE.errorGuardar === true && STATE.cacheDirty === true && !escritos.length);
  falla = false;
  await sb.autoGuardarCache();
  assert("al siguiente que sale bien, se quita el aviso", STATE.errorGuardar === false && !STATE.cacheDirty);

  escritos.length = 0; ARR.olvidando = true;
  await sb.autoGuardarCache();
  assert("con «Olvidar todo» en marcha, nada", escritos.length === 0);
  ARR.olvidando = false;
  const sinCache = STATE.cache; STATE.cache = null;
  await sb.autoGuardarCache();
  assert("sin nada abierto, nada", escritos.length === 0);
  STATE.cache = sinCache;

  console.log("B) Lo de antes pasa al registro nuevo (D2)");
  idb.clear();
  idb.set("archivo:p1", { pestana: "p1", cuando: 100, texto: JSON.stringify(conTx(1)), dirty: false });
  idb.set("archivo:p2", { pestana: "p2", cuando: 200, texto: JSON.stringify(conTx(3)), dirty: true, prep: { nuevas: 3 }, handle: "h" });
  idb.set("cache", "el permiso de antes");
  idb.set("csv", { texto: "a,b" });
  let leido = await sb.arrLeerDelNavegador();
  assert("se queda el más reciente, con lo que dijo su descarga", JSON.parse(leido.texto).transacciones.wallet_tokens.length === 3 && leido.prep.nuevas === 3);
  assert("y se borra lo viejo: solo queda «archivo»", [...idb.keys()].join() === "archivo" && !("handle" in idb.get("archivo")), [...idb.keys()]);
  leido = await sb.arrLeerDelNavegador();
  assert("la segunda vez se lee tal cual", JSON.parse(leido.texto).transacciones.wallet_tokens.length === 3);
  idb.clear(); idb.set("cache", "solo el permiso");
  assert("sin copia de antes: nada, y se borra lo viejo", (await sb.arrLeerDelNavegador()) === null && idb.size === 0);
  idb.clear();
  idb.set("archivo:p1", { cuando: 100, texto: JSON.stringify(conTx(7)) });
  idb.set("archivo:p2", { cuando: 200, texto: '{"truncado' });
  leido = await sb.arrLeerDelNavegador();
  assert("A10: el más reciente roto no deja fuera a uno bueno más antiguo", JSON.parse(leido.texto).transacciones.wallet_tokens.length === 7);

  console.log("C) Al abrir la página");
  const usarCacheReal = sb.arrUsarCache;
  sb.arrUsarCache = async (o, l) => { usos.push([o, l]); STATE.cache = o; };
  idb.clear(); idb.set("archivo", { texto: JSON.stringify(conTx(2)), prep: { nuevas: 2 }, vault: { coincide: false } });
  STATE.cache = null; usos.length = 0;
  await sb.arrRestaurarRecordados();
  assert("sale lo guardado, sin descargar (con «leido»)", usos.length === 1 && sb.arrNumTx(usos[0][0]) === 2 &&
    usos[0][1].prep.nuevas === 2 && usos[0][1].vault.coincide === false, usos[0] && usos[0][1]);
  idb.clear(); STATE.cache = null; usos.length = 0; escritos.length = 0;
  await sb.arrRestaurarRecordados();
  assert("sin nada: uno vacío, sin guardar", usos.length === 0 && STATE.cache && sb.arrNumTx(STATE.cache) === 0 && !escritos.length);
  idb.clear(); idb.set("archivo", { texto: "{roto" }); STATE.cache = null; usos.length = 0; avisos.length = 0;
  await sb.arrRestaurarRecordados();
  assert("mal escrito: se aparta (no se pierde), se avisa y sigue uno vacío", idb.get("archivo_no_leido").texto === "{roto" &&
    avisos.some(([t, m]) => t === "error" && /mal escrito/.test(m)) && usos.length === 0 && sb.arrNumTx(STATE.cache) === 0);
  // Leer falla una vez (no es «no hay nada»): no se guarda encima de lo tuyo.
  idb.clear(); idb.set("archivo", { texto: JSON.stringify(conTx(5)) });
  const operarBueno = sb.idbOperar;
  let fallaLeer = true;
  sb.idbOperar = async (modo, op) => { if (modo === "readonly" && fallaLeer) { fallaLeer = false; throw new Error("lectura que falla"); } return operarBueno(modo, op); };
  STATE.cache = null; usos.length = 0; avisos.length = 0; escritos.length = 0; STATE.errorGuardar = false;
  await sb.arrRestaurarRecordados();
  STATE.cache.ajustes_usuario = { x: { nota: "y" } }; sb.marcarCacheDirty();
  await sb.autoGuardarCache();
  assert("A2: si falla leer, lo dice, no guarda encima y la pantalla dice que no se guarda",
    ARR.sinLeer === true && escritos.length === 0 && STATE.errorGuardar === true && STATE.cacheDirty === true &&
    avisos.some(([t, m]) => t === "error" && /No se pudo leer lo guardado/.test(m)), { escritos: escritos.length, avisos });
  const usarCacheFalso = sb.arrUsarCache;
  const flujoReal = sb.arrFlujo;
  sb.arrUsarCache = usarCacheReal; sb.arrFlujo = async () => {};
  await sb.arrUsarCache(conTx(2));
  sb.arrUsarCache = usarCacheFalso; sb.arrFlujo = flujoReal;
  assert("A2: abrir una copia sí la guarda (sustituye a lo de antes)", ARR.sinLeer === false && escritos.length === 1);
  sb.idbOperar = operarBueno;

  console.log("D) Una sola pestaña (A1)");
  // El bloqueo del navegador de mentira: `libre` dice si lo da; las peticiones que esperan se apuntan.
  let libre = true, recargas = 0;
  const esperando = [];
  sb.navigator = { locks: { request: (nombre, a, b) => {
    const opciones = b ? a : {}, fn = b || a;
    if (opciones.ifAvailable) { const r = fn(libre ? { name: nombre } : null); return Promise.resolve(r === undefined ? undefined : "retenido"); }
    esperando.push([nombre, fn]); return Promise.resolve();
  } } };
  sb.location = { reload: () => { recargas++; } };
  elemento("arrOtraPestana").hidden = true;
  idb.clear(); idb.set("archivo", { texto: JSON.stringify(conTx(2)), prep: null });
  STATE.cache = null; usos.length = 0; ARR.soloLectura = false;
  await sb.arrRestaurarRecordados();
  assert("libre: la retiene y abre lo guardado", usos.length === 1 && !ARR.soloLectura && elemento("arrOtraPestana").hidden === true);
  libre = false; STATE.cache = null; usos.length = 0;
  let lecturas = 0; const operarReal = sb.idbOperar;
  sb.idbOperar = async (...x) => { lecturas++; return operarReal(...x); };
  await sb.arrRestaurarRecordados();
  assert("ocupado (otra pestaña): no lee nada, se queda sin datos y lo dice", lecturas === 0 && usos.length === 0 && STATE.cache === null &&
    ARR.soloLectura === true && elemento("arrOtraPestana").hidden === false, { lecturas, usos: usos.length });
  assert("espera el bloqueo con el mismo nombre y, al soltarlo la otra, se recarga",
    esperando.length === 1 && esperando[0][0] === "reentrack:archivo" && (esperando[0][1](), recargas === 1), { esperando: esperando.length, recargas });
  STATE.cache = conTx(1); escritos.length = 0;
  await sb.autoGuardarCache();
  assert("y aunque algo lo intente, no guarda", escritos.length === 0);
  sb.idbOperar = operarReal; ARR.soloLectura = false;
  delete sb.navigator; STATE.cache = null; usos.length = 0;
  await sb.arrRestaurarRecordados();
  assert("sin Web Locks: sigue como siempre", usos.length === 1 && !ARR.soloLectura);

  console.log("E) ¿Hay datos? ¿Hace cuánto la última copia?");
  STATE.cache = sb.cacheVacia();
  assert("vacío: no", sb.arrHayDatos() === false);
  sb.ponerArchivoRendimientosCache(STATE.cache, "r.csv", "x", new Date());
  assert("solo con el archivo de Reental: sí", sb.arrHayDatos() === true);
  STATE.cache = conTx(1);
  assert("con transacciones: sí", sb.arrHayDatos() === true);
  delete almacen.reental_copias;
  assert("sin copia: null", sb.exDiasUltimaCopia(new Date()) === null);
  const ahora = new Date(2026, 9, 10, 0, 30);
  sb.exApuntarCopia({ fecha: new Date(2026, 9, 9, 23, 50).toISOString(), archivo: "a.json" });
  assert("ayer a última hora: 1 día (por fecha, no por horas)", sb.exDiasUltimaCopia(ahora) === 1);
  sb.exApuntarCopia({ fecha: new Date(2026, 8, 10, 12).toISOString(), archivo: "a.json" });
  assert("hace un mes: 30", sb.exDiasUltimaCopia(ahora) === 30);
  sb.exApuntarCopia({ fecha: new Date(2026, 9, 10, 0, 5).toISOString(), archivo: "a.json" });
  assert("hoy: 0", sb.exDiasUltimaCopia(ahora) === 0);
  console.log("F) Arreglos de la auditoría (A8, A9)");
  // Lo que dijo «🔄 Actualizar» queda guardado al terminar (no el de la vez anterior).
  for (const [id, v] of [["cfgWallet", "0x" + "ab".repeat(20)], ["cfgEthKey", "CLAVE"], ["cfgVault", ""], ["cfgNombre", ""], ["cfgNif", ""]]) elemento(id).value = v;
  elemento("arrFin").hidden = true;
  sb.location = { hash: "", reload() {} };
  Object.assign(sb, { setDot: () => {}, setProgreso: () => {}, setBotonesSync: () => {}, arrClasificarAhora: () => false });
  sb.sincronizar = async () => ({ errores: ["etherscan"], vault: null });
  STATE.cache = conTx(1); escritos.length = 0; ARR.ultimaPreparacion = null;
  await vm.runInContext("arrFlujo", sb)({ sincronizar: true });
  await new Promise(r => setTimeout(r, 30));   // el guardado que pide el flujo al terminar
  const primera = escritos[escritos.length - 1] || {};
  sb.sincronizar = async () => ({ errores: [], vault: null });
  await vm.runInContext("arrFlujo", sb)({ sincronizar: true });
  await new Promise(r => setTimeout(r, 30));   // el guardado que pide el flujo al terminar
  const segunda = escritos[escritos.length - 1] || {};
  assert("A8: tras cada «🔄 Actualizar» se guarda lo que dijo esa descarga", primera.prep && primera.prep.erroresSync.join() === "etherscan" &&
    segunda.prep && segunda.prep.erroresSync.length === 0, { primera: primera.prep, segunda: segunda.prep });
  // El primer guardado sale bien, el segundo (de un cambio hecho mientras) falla: sigue por guardar.
  let soltar1;
  let turno = 0;
  sb.escribirArchivoNavegador = () => (++turno === 1 ? new Promise(r => { soltar1 = r; }) : Promise.reject(new Error("lleno")));
  STATE.cache = conTx(1); STATE.cacheDirty = true; STATE.errorGuardar = false;
  const g1 = sb.autoGuardarCache();
  await new Promise(r => setTimeout(r, 0));
  sb.marcarCacheDirty();
  const g2 = sb.autoGuardarCache();
  soltar1(); await g1; await g2;
  assert("A9: si el último guardado falla, sigue por guardar (no «Nota guardada»)", STATE.cacheDirty === true && STATE.errorGuardar === true);
  sb.escribirArchivoNavegador = async (cache, extra) => { escritos.push({ ...extra, texto: JSON.stringify(cache) }); };

  console.log("G) Copias (A13, A15, A16, A17) y el chip (A18)");
  const ahoraG = new Date(2026, 9, 10, 12);
  sb.exApuntarCopia({ fecha: new Date(2027, 0, 1).toISOString(), archivo: "futura.json" });
  assert("A13: una copia con fecha futura no cuenta como «hoy»: sin días (sale el aviso) y se enseña su fecha",
    sb.exDiasUltimaCopia(ahoraG) === null && /Última copia: <b>01\/01\/2027<\/b>/.test(sb.exHtmlHistorial()), sb.exHtmlHistorial());
  const setItemBueno = sb.localStorage.setItem;
  sb.localStorage.setItem = () => { throw new Error("bloqueado"); };
  sb.exApuntarCopia({ fecha: new Date().toISOString(), archivo: "sin-almacen.json" });
  sb.localStorage.setItem = setItemBueno;
  assert("A16: si el navegador no deja apuntarla, se recuerda en esta sesión", (sb.exUltimaCopia() || {}).archivo === "sin-almacen.json");
  vm.runInContext("exEstado.sinAlmacen = null", sb); delete almacen.reental_copias;
  // Abrir una copia la apunta como tu última copia (si es más nueva).
  const conMarca = conTx(2); conMarca.copia_de_seguridad = { creada: "2026-10-01T10:00:00.000Z" };
  sb.elegirArchivo = async () => ({ name: "reental_cache_2026-10-01_1200.json", text: async () => JSON.stringify(conMarca) });
  sb.confirm = () => true; ARR.preparando = false; usos.length = 0;
  await sb.arrAbrirArchivo();
  const ultimaG = sb.exUltimaCopia() || {};
  assert("A17: abrir una copia la apunta como última copia", usos.length === 1 && ultimaG.fecha === "2026-10-01T10:00:00.000Z" &&
    ultimaG.archivo === "reental_cache_2026-10-01_1200.json" && ultimaG.movimientos === 2, ultimaG);
  sb.exApuntarCopia({ fecha: "2026-10-05T10:00:00.000Z", archivo: "mas-nueva.json" });
  await sb.arrAbrirArchivo();
  assert("A17: una más antigua que tu última copia no la pisa", (sb.exUltimaCopia() || {}).archivo === "mas-nueva.json");
  // Una copia del formato viejo con la marca de copia dentro de su cache: se quita al abrirla.
  const cacheMarcada = conTx(1); cacheMarcada.copia_de_seguridad = { creada: "2026-10-01T10:00:00Z" };
  const vieja = { tipo: "copia_de_seguridad", version: 1, creada: "2026-01-15T21:21:00Z", contenido: { config: null, cache: cacheMarcada, rendimientos: null } };
  usos.length = 0;
  await sb.arrAbrirCopiaVieja(JSON.parse(JSON.stringify(vieja)));
  assert("A15: la cache de una copia vieja entra sin la marca (al recargar no sale «mal escrita»)",
    usos.length === 1 && !("copia_de_seguridad" in usos[0][0]) && sb.arrTipoArchivo(usos[0][0]) === "cache");
  // La cache vacía de la primera vez no sale como «cargado» en el chip.
  STATE.cache = sb.cacheVacia(); STATE.csvCargado = false;
  chipReal();
  const chipVacio = [elemento("chipEstado").textContent, elemento("chipEstado").className];
  STATE.cache = conTx(3);
  chipReal();
  assert("A18: el chip, «Sin datos cargados» con la cache vacía y «3 transacciones» con datos",
    chipVacio.join("|") === "Sin datos cargados|chip" && elemento("chipEstado").textContent === "3 transacciones", [chipVacio, elemento("chipEstado").textContent]);

  console.log("H) Huecos de la auditoría (D6, D8, D11)");
  // La escritura de verdad: en modo de escritura, el registro «archivo», y si falla, se dice.
  const operarH = sb.idbOperar;
  const puestos = [];
  sb.idbOperar = async (modo, op) => { op({ put: (v, k) => puestos.push([modo, k, JSON.parse(v.texto).transacciones.wallet_tokens.length]) }); };
  await escribirReal(conTx(2), { cuando: 1 });
  sb.idbOperar = async () => { throw new Error("lleno"); };
  let lanzo = false;
  try { await escribirReal(conTx(2), {}); } catch (e) { lanzo = true; }
  sb.idbOperar = operarH;
  assert("D6: escribe en modo readwrite el registro «archivo» y, si falla, lo lanza (no se lo traga)",
    puestos.length === 1 && puestos[0].join() === "readwrite,archivo,2" && lanzo, puestos);
  // Lo guardado que no es tu archivo no se abre como tal.
  const cfg = { wallet: "0x" + "ab".repeat(20), etherscan_api_key: "K" };
  const marcada = conTx(1); marcada.copia_de_seguridad = { creada: "2026-10-01T10:00:00Z" };
  assert("D8: un config.json o una copia con su marca guardados en «archivo» no se abren como tu archivo",
    sb.arrCacheGuardada({ texto: JSON.stringify(cfg) }) === null && sb.arrCacheGuardada({ texto: JSON.stringify(marcada) }) === null &&
    sb.arrCacheGuardada({ texto: JSON.stringify(conTx(1)) }) !== null);
  // «ayer» y «hace N días».
  const hace = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
  sb.exApuntarCopia({ fecha: hace(1), archivo: "a.json" });
  const ayer = sb.exHtmlHistorial();
  sb.exApuntarCopia({ fecha: hace(12), archivo: "a.json" });
  assert("D11: «Última copia: ayer» y «hace 12 días»", /<b>ayer<\/b>/.test(ayer) && /<b>hace 12 días<\/b>/.test(sb.exHtmlHistorial()), [ayer, sb.exHtmlHistorial()]);

  // El almacenamiento persistente se pide una vez.
  let persistes = 0;
  sb.navigator = { storage: { persist: () => { persistes++; return Promise.resolve(true); } } };
  sb.arrTrasGuardar(); sb.arrTrasGuardar();
  delete sb.navigator;
  assert("D9: tras guardar se pide almacenamiento persistente, una sola vez", persistes === 1, persistes);

  assert("escribirArchivoNavegador escribe el registro «archivo» con su texto", /put\(\{ \.\.\.extra, texto: JSON\.stringify\(cache\) \}, ALMACEN_ARCHIVO\)/.test(escribirReal.toString()));

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
