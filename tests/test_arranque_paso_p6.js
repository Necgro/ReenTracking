/* P6: la primera descarga de 🚀 empieza sola.
 *
 * Bajo prueba (js/19): arrTrasCambioConfig lanza arrFlujo({ sincronizar: true })
 * en cuanto wallet y API key valen y no hay nada descargado, una vez por
 * wallet, vault y key; y arrFlujo hace el cuadre con la blockchain al cargar
 * el archivo de Reental si la descarga fue sin él.
 *
 * DATOS 100% SINTÉTICOS. Ejecución: node tests/test_arranque_paso_p6.js
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
  location: { hash: "" },
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
const flujoReal = sb.arrFlujo;

const W = "0x" + "a1".repeat(20), W2 = "0x" + "c3".repeat(20);
let flujos = [];
const llamadas = { sync: 0, cuadre: 0 };
let clasifica = false, erroresSync = [], guardados = 0;
Object.assign(sb, {
  toast: () => {}, log: () => {}, renderPanel: () => {}, actualizarChipEstado: () => {}, setDot: () => {},
  setProgreso: () => {}, arrPintarSeguro: () => {}, autoGuardarCache: async () => { guardados++; }, leerConfigDesdeFormulario: () => {},
  sincronizar: async () => { llamadas.sync++; STATE.cache.transacciones.wallet_normales.push({ hash: "0x1" }); return { errores: erroresSync }; },
  arrClasificarAhora: () => clasifica,
  cuadreLeer: async () => { llamadas.cuadre++; },
  arrFlujo: async o => { flujos.push(o); },
});
const preparar = (cfg, nTx) => {
  STATE.cache = sb.asegurarEstructuraCache(sb.cacheVacia());
  for (let i = 0; i < nTx; i++) STATE.cache.transacciones.wallet_normales.push({ hash: "0x" + i });
  STATE.config = Object.assign({ wallet: W, vault: "", etherscan_api_key: "CLAVE_1", compra_bancaria_coste_eur_por_token: 100 }, cfg);
  STATE.csvCargado = false; STATE.filasCsv = [];
  ARR.preparando = false; ARR.descargaSola = null; ARR.ultimaPreparacion = null;
  flujos = [];
};

(async () => {
  console.log("A) Arranca sola al tener wallet y API key");
  preparar({ etherscan_api_key: "" }, 0);
  sb.arrTrasCambioConfig();
  assert("solo la wallet: no descarga", flujos.length === 0, flujos);
  STATE.config.etherscan_api_key = "CLAVE_1";
  sb.arrTrasCambioConfig();
  assert("con la key: descarga sola", flujos.length === 1 && flujos[0].sincronizar === true, flujos);
  sb.arrTrasCambioConfig();
  assert("tocar otro campo con lo mismo: no repite", flujos.length === 1, flujos);
  STATE.config.etherscan_api_key = "CLAVE_2";
  sb.arrTrasCambioConfig();
  assert("key corregida: lo intenta otra vez", flujos.length === 2, flujos);
  STATE.config.wallet = W2;
  sb.arrTrasCambioConfig();
  assert("otra wallet sin nada descargado: también", flujos.length === 3, flujos);
  STATE.config.vault = "0x" + "b2".repeat(20);
  sb.arrTrasCambioConfig();
  assert("solo cambia el vault: también", flujos.length === 4, flujos);

  preparar({ wallet: "0x123" }, 0);
  sb.arrTrasCambioConfig();
  assert("wallet mal escrita: no descarga", flujos.length === 0, flujos);
  preparar({}, 3);
  sb.arrTrasCambioConfig();
  assert("ya hay transacciones: no descarga (manda «🔄 Actualizar»)", flujos.length === 0, flujos);
  preparar({}, 0);
  ARR.preparando = true;
  sb.arrTrasCambioConfig();
  assert("con algo en marcha: no descarga", flujos.length === 0, flujos);

  console.log("B) El CSV después de la descarga: clasifica y cuadra");
  preparar({}, 0);
  sb.configValidaParaSincronizar = () => [];
  clasifica = false;
  await flujoReal({ sincronizar: true });
  assert("descarga sin CSV: ni clasifica ni cuadra, queda pendiente",
    llamadas.sync === 1 && llamadas.cuadre === 0 && ARR.ultimaPreparacion.cuadrePendiente === sb.arrHuellaConfig(STATE.config), ARR.ultimaPreparacion);
  clasifica = true;
  guardados = 0;
  await flujoReal({ sincronizar: false });
  assert("al cargar el CSV: clasifica y cuadra",
    llamadas.cuadre === 1 && ARR.ultimaPreparacion.clasificado && !ARR.ultimaPreparacion.cuadrePendiente, ARR.ultimaPreparacion);
  assert("y se guarda que ya no está pendiente (al abrir no se repite)", guardados === 1, guardados);
  guardados = 0;
  await flujoReal({ sincronizar: false });
  assert("después, sin descargar, no vuelve a cuadrar ni a guardar", llamadas.cuadre === 1 && guardados === 0, [llamadas, guardados]);
  await flujoReal({ sincronizar: true });
  assert("con «🔄 Actualizar» y el CSV: cuadra como siempre", llamadas.sync === 2 && llamadas.cuadre === 2, llamadas);

  console.log("C) Lo que no se cuadra al cargar el CSV");
  preparar({}, 0);
  clasifica = false; erroresSync = ["etherscan"];
  await flujoReal({ sincronizar: true });
  clasifica = true; erroresSync = [];
  await flujoReal({ sincronizar: false });
  assert("descarga de Etherscan fallida y luego el CSV: no cuadra (saldría una diferencia falsa)", llamadas.cuadre === 2, llamadas);
  preparar({}, 0);
  clasifica = false;
  await flujoReal({ sincronizar: true });
  STATE.config.vault = "0x" + "b2".repeat(20);   // escrito a mano, sin descargar su vault
  clasifica = true;
  await flujoReal({ sincronizar: false });
  assert("vault escrito después de descargar: no cuadra con lo que falta por bajar",
    llamadas.cuadre === 2 && !ARR.ultimaPreparacion.cuadrePendiente, [llamadas, ARR.ultimaPreparacion]);

  console.log("\n" + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})();
