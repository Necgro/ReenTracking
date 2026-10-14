/* P12: 🚀 propone el vault si falta.
 *
 * Bajo prueba: vaultCandidatos y vaultsCreadosPor (js/06), «No data found»
 * como lista vacía en etherscanGet (js/06), vaultsRechazados/rechazarVault
 * (js/05) y cuándo busca arrFlujo (js/19): tras descargar bien, solo con
 * el vault vacío.
 *
 * DATOS 100% SINTÉTICOS. Ejecución: node tests/test_vault_paso_p12.js
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
const sb = {
  console: Object.assign({}, console, { error: () => {} }),
  document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }) },
  localStorage: { setItem() {}, getItem: () => null, removeItem() {} },
  location: { hash: "" }, URLSearchParams,
  setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array, Set, Map, BigInt,
};
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "06-etherscan.js",
                 "10-csv-descubrimiento.js", "12-carga-archivos.js", "14-clasificador.js", "24-exportar.js", "19-arranque.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
const ev = expr => vm.runInContext(expr, sb);
const STATE = ev("state"), ARR = ev("arr");
const FABRICA = ev("FABRICA_VAULTS");

const dir = n => "0x" + n.repeat(40 / n.length);
const W = dir("a1"), VAULT = dir("b2"), VAULT2 = dir("b3"), OTRO = dir("c4"), SAFE = dir("d5"), EOA = dir("e6"), INMUEBLE = dir("f7");
const TS = "1700000000";   // 14/11/2023 22:13 UTC (23:13 en España)
const creado = (a, creador, fabrica) => ({ contractAddress: a, contractCreator: creador, contractFactory: fabrica, timestamp: TS, txHash: "0x1" });
// Lo que Etherscan sabe de cada dirección (las que no son contratos no salen).
const ETHERSCAN = {
  [VAULT]: creado(VAULT, W, FABRICA), [VAULT2]: creado(VAULT2, W, FABRICA),
  [OTRO]: creado(OTRO, dir("99"), FABRICA), [SAFE]: creado(SAFE, W, dir("88")), [INMUEBLE]: creado(INMUEBLE, dir("77"), ""),
};
let preguntas = [];
const consultar = async params => {
  const lote = params.contractaddresses.split(",");
  preguntas.push(lote);
  if (lote.length > 5) return null;
  return lote.filter(a => ETHERSCAN[a]).map(a => ETHERSCAN[a]);
};
const cacheCon = tos => {
  const c = sb.asegurarEstructuraCache(sb.cacheVacia());
  c.transacciones.wallet_normales = tos.map((to, i) => ({ hash: "0x" + i, from: W, to }));
  return c;
};

(async () => {
  console.log("A) Candidatos");
  const c = cacheCon([VAULT, VAULT, W, sb.USDT, sb.RNT, "0x0bdf6e4674b408cac2fb00d840c549b4e410cf47", INMUEBLE, OTRO, "", EOA.toUpperCase().replace("0X", "0x")]);
  c.catalogo_propiedades[INMUEBLE] = { simbolo: "INM" };
  let cand = sb.vaultCandidatos(c, W);
  assert("sin la wallet, tokens, DeFi ni inmuebles; sin repetir", JSON.stringify(cand) === JSON.stringify([VAULT, OTRO, EOA]), cand);
  sb.rechazarVault(c, VAULT.toUpperCase().replace("0X", "0x"));
  cand = sb.vaultCandidatos(c, W);
  assert("sin los rechazados", !cand.includes(VAULT) && JSON.stringify(c.vaults_rechazados) === JSON.stringify([VAULT]), c.vaults_rechazados);
  sb.rechazarVault(c, VAULT);
  assert("rechazar dos veces no lo repite", c.vaults_rechazados.length === 1, c.vaults_rechazados);
  c.vaults_rechazados = "mal";
  assert("lista mal escrita: no quita nada", sb.vaultCandidatos(c, W).includes(VAULT));
  assert("sin transacciones: ninguno", sb.vaultCandidatos(cacheCon([]), W).length === 0);

  console.log("B) Lo que propone");
  preguntas = [];
  let r = await sb.vaultsCreadosPor([VAULT, OTRO, SAFE, EOA], W, "K", 0, consultar);
  assert("el que creó la wallet con la fábrica de Reental", r.length === 1 && r[0].direccion === VAULT, r);
  assert("con su fecha", sb.fechaEs(r[0].fecha) === "14/11/2023", sb.fechaEs(r[0].fecha));
  assert("ni el creado por otro ni el de otra fábrica", !r.some(v => v.direccion === OTRO || v.direccion === SAFE));
  r = await sb.vaultsCreadosPor([VAULT, VAULT2], W, "K", 0, consultar);
  assert("con dos, los dos", r.length === 2, r);
  preguntas = [];
  r = await sb.vaultsCreadosPor([EOA, OTRO, SAFE, INMUEBLE, dir("11"), dir("12"), VAULT2], W, "K", 0, consultar);
  assert("de 5 en 5", preguntas.length === 2 && preguntas[0].length === 5 && preguntas[1].length === 2, preguntas);
  assert("encuentra el del segundo lote", r.length === 1 && r[0].direccion === VAULT2, r);
  assert("un fallo de Etherscan: null", (await sb.vaultsCreadosPor([VAULT], W, "K", 0, async () => null)) === null);
  const raro = Object.assign(creado(VAULT, W, FABRICA), { contractAddress: "<img src=x onerror=alert(1)>" });
  r = await sb.vaultsCreadosPor([VAULT], W, "K", 0, async () => [raro]);
  assert("una dirección mal escrita de Etherscan no se propone", r.length === 0, r);

  console.log("C) «No data found» no es un fallo");
  const avisos = [];
  sb.log = (m, t) => avisos.push([t, m]);
  sb.fetch = async () => ({ json: async () => ({ status: "0", message: "No data found", result: null }) });
  const lista = await sb.etherscanGet({ module: "contract" }, "K", "vault");
  assert("un lote solo de wallets: lista vacía, sin aviso", Array.isArray(lista) && !lista.length && !avisos.length, avisos);

  console.log("D) Cuándo busca");
  let buscadas = 0, propuestas = [];
  Object.assign(sb, {
    toast: () => {}, log: () => {}, renderPanel: () => {}, actualizarChipEstado: () => {}, setDot: () => {},
    setProgreso: () => {}, arrPintarSeguro: () => {}, autoGuardarCache: async () => {}, leerConfigDesdeFormulario: () => {},
    configValidaParaSincronizar: () => [], arrClasificarAhora: () => false, cuadreLeer: async () => {},
    vaultsCreadosPor: async () => { buscadas++; return [{ direccion: VAULT, fecha: new Date() }]; },
    arrProponerVault: l => propuestas.push(l),
  });
  let errores = [];
  sb.sincronizar = async () => ({ errores });
  const flujo = async (sincronizar, vault) => {
    STATE.cache = cacheCon([VAULT]);
    STATE.config = { wallet: W, vault, etherscan_api_key: "K", compra_bancaria_coste_eur_por_token: 100 };
    ARR.preparando = false; ARR.ultimaPreparacion = null;
    buscadas = 0; propuestas = [];
    await sb.arrFlujo({ sincronizar });
  };
  await flujo(true, "");
  assert("tras descargar con el vault vacío: busca y lo propone", buscadas === 1 && propuestas.length === 1, propuestas);
  await flujo(true, VAULT2);
  assert("con el vault puesto: ni pregunta a Etherscan", buscadas === 0 && !propuestas.length);
  await flujo(false, "");
  assert("sin descargar (el CSV, abrir la página): no busca", buscadas === 0);
  errores = ["etherscan"];
  await flujo(true, "");
  assert("con la descarga de Etherscan fallida: no busca", buscadas === 0);
  errores = [];
  sb.vaultsCreadosPor = async () => null;
  await flujo(true, "");
  assert("si la búsqueda falla: nada que proponer", !propuestas.length);
  sb.vaultsCreadosPor = async () => { throw new Error("x"); };
  await flujo(true, "");
  assert("si revienta: el flujo termina igual", !propuestas.length && !ARR.preparando && ARR.ultimaPreparacion);

  console.log("\n" + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})();
