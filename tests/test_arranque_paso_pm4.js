/* Test de 🚀 en una tarjeta, con «📂 Abrir copia».
 *
 * Bajo prueba (Reental-SPA/js/19-arranque.js):
 * - arrTipoArchivo: reconoce tu archivo (cache), una copia nueva (cache con
 *   «copia_de_seguridad»), una copia del formato viejo, un config.json y lo demás.
 * - arrAbrirArchivo («📂 Abrir copia»): con cada tipo hace lo
 *   suyo (cache o copia nueva → sustituye a lo de este navegador, sin la
 *   marca y con un aviso con su fecha, preguntando si hay datos; copia
 *   vieja → su lector; config.json → solo tus datos; otra cosa, un JSON roto
 *   o cancelar → nada cambia).
 * - arrUsarCache: mandan tus datos y el archivo de Reental de dentro; una
 *   cache sin ellos los recibe; si el archivo de Reental cargado es más
 *   nuevo, gana y el resumen lo dice; un solo guardado (en el navegador);
 *   con lo guardado al recargar («leido»), sin cambios no se guarda y
 *   vuelve lo que dijo la última descarga.
 * - arrEvaluar: sin «Paso 1, 2, 3»; tu archivo nunca falta.
 * - arrResumen: sin «paso N»; la línea del archivo de Reental más nuevo.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_arranque_paso_pm4.js
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
const almacen = {};
const sb = {
  console: Object.assign({}, console, { error: () => {} }),
  document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }) },
  localStorage: { setItem: (k, v) => { almacen[k] = String(v); }, getItem: k => almacen[k] ?? null, removeItem: k => { delete almacen[k]; } },
  setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array, Set, Map, BigInt,
};
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "12-carga-archivos.js", "14-clasificador.js", "24-exportar.js", "19-arranque.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
const ev = expr => vm.runInContext(expr, sb);
const STATE = ev("state"), ARR = ev("arr");

// Lo que no se prueba aquí: descargar, clasificar, pintar y el navegador.
const avisos = [], olvidados = [];
let ultimoFlujo = null;   // con qué se llamó al flujo
let escrituras = 0, flujos = 0, respuesta = true, preguntas = [];
Object.assign(sb, {
  toast: (msg, tipo) => avisos.push([tipo, msg]), log: () => {},
  confirm: m => { preguntas.push(m); return respuesta; },
  escribirArchivoNavegador: async () => { escrituras++; },   // js/05
  renderPanel: () => {}, actualizarChipEstado: () => {}, setDot: () => {}, setProgreso: () => {},
  arrFlujo: async o => { flujos++; ultimoFlujo = o; }, arrPintarSeguro: () => {},
});

const W = "0x" + "a1".repeat(20), V = "0x" + "b2".repeat(20), W2 = "0x" + "c3".repeat(20);
const CLAVE = "CLAVE_SINTETICA_123";
const CAB = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
const csv = fechas => [CAB, ...fechas.map((f, i) => "\"Prueba#" + (i + 1) + "\"," + f + ",2,0,2,0,\"[]\",\"[]\"," + W)].join("\n") + "\n";
const C2 = csv(["2026-01-10", "2026-02-10"]), C3 = csv(["2026-01-10", "2026-02-10", "2026-03-10"]);
const limpiar = () => {
  STATE.cache = null; STATE.cacheDirty = false; STATE.registros = null;
  STATE.filasCsv = []; STATE.indicePorHash = {}; STATE.csvCargado = false; STATE.csvArchivo = undefined;
  STATE.config = { wallet: W, vault: "", etherscan_api_key: CLAVE, inversor: { nombre: "Ana", nif: "" } };
  ARR.csvFueraMasNuevo = false; ARR.ultimaPreparacion = null;
  avisos.length = 0; olvidados.length = 0; escrituras = 0; flujos = 0; respuesta = true; preguntas = [];
};
const cacheCon = (cfg, texto) => {
  const c = sb.cacheVacia();
  if (cfg) sb.ponerConfiguracionCache(c, cfg, "etherscan_api_key" in cfg);
  if (texto) sb.ponerArchivoRendimientosCache(c, "de-dentro.csv", texto, new Date("2026-10-07T10:00:00Z"));
  return JSON.parse(JSON.stringify(c));
};

(async () => {
  console.log("A) Qué archivo es");
  const cache = sb.cacheVacia();
  const copiaNueva = Object.assign(JSON.parse(JSON.stringify(cache)), { copia_de_seguridad: { creada: "2026-10-07T10:00:00Z" } });
  const copiaVieja = { tipo: "copia_de_seguridad", version: 1, creada: "2026-01-15T21:21:00Z", contenido: { config: null, cache, rendimientos: null } };
  const casos = [[cache, "cache"], [copiaNueva, "copia"], [copiaVieja, "copia_vieja"], [{ wallet: W, etherscan_api_key: "K" }, "config"],
    [[], "otro"], [null, "otro"], [7, "otro"], [{ a: 1 }, "otro"], [{ transacciones: [] }, "otro"]];
  for (const [obj, tipo] of casos) assert(JSON.stringify(obj).slice(0, 40) + " → " + tipo, sb.arrTipoArchivo(obj) === tipo, sb.arrTipoArchivo(obj));

  console.log("B) Dos estados y lo que falta");
  let r = sb.arrEvaluar({ config: {}, cache: null, csvCargado: false, nCsv: 0, registros: null });
  assert("sin cache (un instante al abrir la página): no falta, pero no se puede actualizar",
    !r.conArchivo && !r.faltan.some(f => f.paso === "cache") && !r.puedeActualizar, r.faltan);
  assert("sin «Paso 1, 2, 3»", !r.faltan.some(f => /paso \d/i.test(f.texto)), r.faltan);
  r = sb.arrEvaluar({ config: { wallet: W, etherscan_api_key: "K", compra_bancaria_coste_eur_por_token: 100 }, cache: {}, csvCargado: true, nCsv: 2, registros: null });
  assert("con archivo y todo: nada falta", r.conArchivo && !r.faltaConfig && r.faltan.length === 0 && r.puedeActualizar, r);

  console.log("C) Resumen");
  const base = { cacheOk: true, csvOk: true, configOk: true, keyOk: false, vaultConfigurado: true, conArchivo: true };
  const todo = [{ csvOk: false }, { configOk: false, walletMal: true }, { keyOk: false }, { descuadres: { csvMasNuevo: 0, sinArchivo: 2 } },
    { vaultConfigurado: false, vaultEnCache: true }, { errorGuardar: true }]
    .map(d => sb.arrResumen(Object.assign({}, base, d)));
  assert("ningún texto dice «paso N»", !JSON.stringify(todo).match(/paso \d/i), JSON.stringify(todo).match(/.{30}paso \d.{10}/i));
  const conMasNuevo = sb.arrResumen(Object.assign({}, base, { csvFueraMasNuevo: true }));
  assert("archivo de Reental más nuevo que el de dentro: lo dice",
    conMasNuevo.lineas.some(l => l.tipo === "info" && l.texto === "Archivo de Reental: se usa el que cargaste, más nuevo que el de la copia."));

  console.log("D) Al abrir tu archivo");
  limpiar();
  await sb.arrUsarCache(cacheCon({ wallet: W, vault: V, inversor: { nombre: "", nif: "0T" } }, C3));
  assert("mandan tus datos de dentro; vacío no borra; la API key, la del navegador",
    STATE.config.wallet === W && STATE.config.vault === V && STATE.config.inversor.nombre === "Ana" && STATE.config.inversor.nif === "0T" &&
    STATE.config.etherscan_api_key === CLAVE && elemento("cfgVault").value === V, STATE.config);
  assert("se aplica el archivo de Reental de dentro", STATE.csvCargado && STATE.filasCsv.length === 3 && STATE.csvArchivo.nombre === "de-dentro.csv");
  // Con la casilla marcada (de entrada), la API key también entra.
  assert("tus datos completan el bloque (el nombre y la API key) y se guarda una vez", escrituras === 1 && !STATE.cacheDirty &&
    STATE.cache.configuracion.inversor.nombre === "Ana" && STATE.cache.configuracion.etherscan_api_key === CLAVE, escrituras);
  assert("y sigue el flujo (descargar y clasificar): una copia abierta descarga lo nuevo", flujos === 1 && ultimoFlujo.sincronizar === true);

  // Con la casilla desmarcada en este navegador, abrir no recorta tu archivo.
  limpiar();
  almacen.reental_datos_en_archivo = "no";
  const completo = cacheCon({ wallet: W, vault: "", inversor: { nombre: "Ana", nif: "0T" }, etherscan_api_key: CLAVE }, C3);
  await sb.arrUsarCache(completo);
  assert("A4: casilla desmarcada: abrir no le quita a tu archivo el nombre, el NIF ni la API key",
    escrituras === 1 && STATE.cache.configuracion.inversor.nif === "0T" && STATE.cache.configuracion.etherscan_api_key === CLAVE, STATE.cache.configuracion);
  STATE.config.inversor.nombre = "Ana B"; sb.guardarConfigLocalSilencioso();
  assert("A4: cambiar tus datos sí aplica la casilla (fuera el nombre, el NIF y la API key)",
    STATE.cache.configuracion.inversor.nif === "" && !("etherscan_api_key" in STATE.cache.configuracion), STATE.cache.configuracion);
  limpiar();
  await sb.arrUsarCache(JSON.parse(JSON.stringify(sb.cacheVacia())));
  assert("A4: una cache sin tus datos dentro recibe la wallet (sin nombre ni API key)", STATE.cache.configuracion.wallet === W &&
    !STATE.cache.configuracion.inversor.nombre && !("etherscan_api_key" in STATE.cache.configuracion), STATE.cache.configuracion);
  delete almacen.reental_datos_en_archivo;

  // Lo de este navegador es de otra wallet (un ordenador compartido).
  limpiar();
  STATE.config.vault = V; sb.volcarConfigAFormulario();
  await sb.arrUsarCache(cacheCon({ wallet: W2, vault: "", inversor: { nombre: "", nif: "" } }, C3));
  assert("A2: un archivo de otra wallet no se lleva el vault, el nombre ni la API key de este navegador",
    STATE.config.wallet === W2 && !STATE.config.vault && !STATE.config.inversor.nombre && STATE.config.etherscan_api_key === "" &&
    !STATE.cache.configuracion.vault && !STATE.cache.configuracion.inversor.nombre && !STATE.cache.configuracion.etherscan_api_key &&
    elemento("cfgEthKey").value === "", { config: STATE.config, dentro: STATE.cache.configuracion });

  limpiar();
  STATE.config.inversor.nombre = "";
  await sb.arrUsarCache(cacheCon({ wallet: W, vault: "", inversor: { nombre: "", nif: "" }, etherscan_api_key: CLAVE }, C3), {});
  assert("lo guardado al recargar: si no cambia nada, no se guarda", escrituras === 0 && !STATE.cacheDirty);
  assert("lo guardado al recargar sale sin descargar", ultimoFlujo.sincronizar === false);

  limpiar();
  sb.aplicarCsvTexto(C2, false, "cargado.csv");
  await sb.arrUsarCache(JSON.parse(JSON.stringify(sb.cacheVacia())));
  assert("una cache de antes recibe tus datos y el archivo cargado, con un solo guardado",
    STATE.cache.configuracion.wallet === W && sb.leerArchivoRendimientosCache(STATE.cache).texto === C2 &&
    sb.leerArchivoRendimientosCache(STATE.cache).nombre === "cargado.csv" && escrituras === 1 && !STATE.cacheDirty && !ARR.csvFueraMasNuevo);

  limpiar();
  sb.aplicarCsvTexto(C3, false, "nuevo.csv");
  await sb.arrUsarCache(cacheCon(null, C2));
  assert("el cargado, más nuevo que el de dentro: gana, entra y el resumen lo sabrá",
    sb.leerArchivoRendimientosCache(STATE.cache).texto === C3 && STATE.filasCsv.length === 3 && ARR.csvFueraMasNuevo && escrituras === 1);

  limpiar();
  await sb.arrUsarCache(cacheCon({ wallet: W, vault: "", inversor: { nombre: "Ana", nif: "" }, etherscan_api_key: CLAVE }, C3),
    { prep: { sincronizado: true, nuevas: 2, total: 5 }, vault: { coincide: true } });
  assert("COPIA-5 A8: lo guardado trae lo que dijo la última descarga", ARR.ultimaPreparacion.nuevas === 2 && STATE.sync.vault.coincide === true &&
    escrituras === 0, ARR.ultimaPreparacion);

  console.log("E) «📂 Abrir copia» (ALMACEN-1)");
  const usos = [];
  const usarReal = sb.arrUsarCache, viejaReal = sb.arrAbrirCopiaVieja;
  sb.arrUsarCache = async (o, leido) => { usos.push([o, leido]); };
  sb.arrAbrirCopiaVieja = async o => { usos.push(["vieja", o]); };
  sb.arrTrasCambioConfig = () => { usos.push(["config"]); };
  // El archivo elegido: su texto; sin nada, cancelar.
  const abrir = async (obj, texto) => {
    usos.length = 0; avisos.length = 0; preguntas = [];
    sb.elegirArchivo = async () => (obj === undefined && texto === undefined ? null : { text: async () => texto ?? JSON.stringify(obj) });
    await sb.arrAbrirArchivo();
  };
  limpiar();
  STATE.config = {}; sb.volcarConfigAFormulario();
  await abrir(cache);
  assert("tu reental_cache.json de antes: sustituye a lo de este navegador y descarga lo nuevo (sin «leido»), sin preguntar si no hay nada",
    usos.length === 1 && usos[0][1] === undefined && preguntas.length === 0 && avisos.some(([t, m]) => t === "ok" && m === "Copia abierta."), { usos, avisos });
  const avisoCopia = () => (avisos.find(([t, m]) => t === "ok" && /abierta\.$/.test(m)) || [])[1] || "";
  await abrir(copiaNueva);
  assert("copia nueva sin nada: sin la marca, sin preguntar y el aviso con su fecha",
    usos.length === 1 && !("copia_de_seguridad" in usos[0][0]) && preguntas.length === 0 &&
    /^Copia del 07\/10\/2026 \d\d:\d\d abierta\.$/.test(avisoCopia()), { usos, avisos });
  for (const [nombre, marca] of [["sin fecha", {}], ["con la fecha mal escrita", { creada: "2026-13-45T99:00:00Z" }], ["con la marca rota", "x"]]) {
    await abrir(Object.assign(JSON.parse(JSON.stringify(cache)), { copia_de_seguridad: marca }));
    assert("copia " + nombre + ": se abre igual, sin inventar fecha", usos.length === 1 && !("copia_de_seguridad" in usos[0][0]) &&
      avisoCopia() === "Copia abierta.", avisos);
  }
  // «Sin nada» es también sin tus datos escritos (con ellos, pregunta).
  limpiar(); sb.volcarConfigAFormulario();
  respuesta = false;
  await abrir(copiaNueva);
  assert("con tus datos escritos: pregunta con su fecha que sustituye a lo de este navegador; «no» no cambia nada",
    usos.length === 0 && preguntas.length === 1 && /¿Abrir la copia del 07\/10\/2026/.test(preguntas[0]) &&
    /Sustituye a lo que hay en este navegador\./.test(preguntas[0]) && !avisos.length, { preguntas, avisos });
  STATE.config = {}; sb.volcarConfigAFormulario();
  STATE.cache = cacheCon(null, C2);
  await abrir(cache);
  assert("con datos guardados (el archivo de Reental): también pregunta", usos.length === 0 && /¿Abrir esta copia\?/.test(preguntas[0] || ""), preguntas);
  respuesta = true;
  limpiar(); sb.volcarConfigAFormulario();
  await abrir(copiaVieja);
  assert("copia vieja: su lector de siempre", usos.length === 1 && usos[0][0] === "vieja");
  STATE.cache = null;
  await abrir({ wallet: W2, inversor: { nif: "9X" } });
  assert("config.json: solo tus datos, y reclasifica si toca", STATE.config.wallet === W2 && STATE.config.inversor.nif === "9X" &&
    STATE.config.etherscan_api_key === CLAVE && usos.length === 1 && usos[0][0] === "config");
  for (const [nombre, obj, texto] of [["otra cosa", { a: 1 }], ["un JSON roto", null, "{roto"]]) {
    const antes = JSON.stringify(STATE.config);
    await abrir(obj, texto);
    assert(nombre + ": «no es tuyo de Reental» y nada cambia", usos.length === 0 && JSON.stringify(STATE.config) === antes &&
      avisos.some(([t, m]) => t === "error" && m === "Ese archivo no es de esta app. No ha cambiado nada."), avisos);
  }
  await abrir();
  assert("cancelar: nada, sin aviso", usos.length === 0 && avisos.length === 0);
  ARR.preparando = true;
  await abrir(cache);
  assert("con un flujo en marcha no hace nada", usos.length === 0);
  ARR.preparando = false;
  sb.arrUsarCache = usarReal; sb.arrAbrirCopiaVieja = viejaReal;

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
