/* P12: 🚀 propone el vault si falta.
 *
 * Bajo prueba: vaultCandidatos y vaultsCreadosPor (js/06), «No data found»
 * como lista vacía en etherscanGet (js/06), vaultsRechazados/rechazarVault
 * (js/05), cuándo busca y propone arrFlujo/arrBuscarVault (js/19: tras
 * descargar bien, solo con el vault vacío, una vez por wallet y sesión) y la
 * mini ventana (arrProponerVault e index.html).
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
  showModal() { this.open = true; }, close() { this.open = false; },
  eventos: [], dispatchEvent(e) { this.eventos.push(e.type); },
});
const sb = {
  console: Object.assign({}, console, { error: () => {} }),
  document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }) },
  localStorage: { setItem() {}, getItem: () => null, removeItem() {} },
  location: { hash: "" }, URLSearchParams, Intl, Event: class { constructor(t) { this.type = t; } },
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
const mayus = a => "0x" + a.slice(2).toUpperCase();
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
  if (lote.length > 5 || lote.some(a => !/^0x[0-9a-f]{40}$/.test(a))) return null;
  return lote.filter(a => ETHERSCAN[a]).map(a => ETHERSCAN[a]);
};
const cacheCon = tos => {
  const c = sb.asegurarEstructuraCache(sb.cacheVacia());
  c.transacciones.wallet_normales = tos.map((to, i) => ({ hash: "0x" + i, from: W, to }));
  return c;
};

(async () => {
  console.log("A) Candidatos");
  const [USDT, USDC, RNT, BURN] = ["USDT", "USDC", "RNT", "BURN"].map(ev);
  const APRENDIDO = dir("a7");
  const c = cacheCon([VAULT, VAULT, W, USDT, USDC, RNT, BURN, "0x0bdf6e4674b408cac2fb00d840c549b4e410cf47", INMUEBLE, APRENDIDO,
    OTRO, "", "0x12", mayus(EOA)]);
  c.catalogo_propiedades[INMUEBLE] = { simbolo: "INM" };
  c.contratos_aprendidos.DEFI_POOL[APRENDIDO] = "Pool aprendido";
  let cand = sb.vaultCandidatos(c, W);
  assert("sin la wallet, tokens, DeFi, aprendidos, inmuebles ni direcciones mal escritas; sin repetir",
    JSON.stringify(cand) === JSON.stringify([VAULT, OTRO, EOA]), cand);
  sb.rechazarVault(c, mayus(VAULT));
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
  assert("con su fecha", r[0].fecha instanceof Date && r[0].fecha.getTime() === 1700000000000, r[0].fecha);
  assert("ni el creado por otro ni el de otra fábrica", !r.some(v => v.direccion === OTRO || v.direccion === SAFE));
  r = await sb.vaultsCreadosPor([VAULT, VAULT2], W, "K", 0, consultar);
  assert("con dos, los dos", r.length === 2, r);
  r = await sb.vaultsCreadosPor([VAULT], W, "K", 0, async () =>
    [{ contractAddress: mayus(VAULT), contractCreator: mayus(W), contractFactory: mayus(FABRICA), timestamp: TS }]);
  assert("Etherscan en mayúsculas: lo reconoce", r.length === 1 && r[0].direccion === VAULT, r);
  preguntas = [];
  r = await sb.vaultsCreadosPor([EOA, OTRO, SAFE, INMUEBLE, dir("11"), dir("12"), VAULT2], W, "K", 0, consultar);
  assert("de 5 en 5", preguntas.length === 2 && preguntas[0].length === 5 && preguntas[1].length === 2, preguntas);
  assert("encuentra el del segundo lote", r.length === 1 && r[0].direccion === VAULT2, r);
  let t0 = Date.now();
  await sb.vaultsCreadosPor([EOA, OTRO, SAFE, INMUEBLE, dir("11"), VAULT2], W, "K", 60, consultar);
  assert("con una pausa entre lotes", Date.now() - t0 >= 55, Date.now() - t0);
  t0 = Date.now();
  await sb.vaultsCreadosPor([EOA, VAULT2], W, "K", 2000, consultar);
  assert("sin pausa antes del primero", Date.now() - t0 < 1000, Date.now() - t0);
  assert("un fallo de Etherscan sin nada hallado: null", (await sb.vaultsCreadosPor([VAULT], W, "K", 0, async () => null)) === null);
  let lote = 0;
  r = await sb.vaultsCreadosPor([VAULT, EOA, OTRO, SAFE, INMUEBLE, VAULT2], W, "K", 0, async p => (++lote === 2 ? null : consultar(p)));
  assert("si falla un lote, lo hallado en los otros sigue", r && r.length === 1 && r[0].direccion === VAULT, r);
  const raro = Object.assign(creado(VAULT, W, FABRICA), { contractAddress: "<img src=x onerror=alert(1)>" });
  r = await sb.vaultsCreadosPor([VAULT], W, "K", 0, async () => [raro]);
  assert("una dirección mal escrita de Etherscan no se propone", r.length === 0, r);
  for (const ts of [undefined, null, "", "abc"]) {
    r = await sb.vaultsCreadosPor([VAULT], W, "K", 0, async () => [Object.assign(creado(VAULT, W, FABRICA), { timestamp: ts })]);
    assert("sin fecha válida (" + JSON.stringify(ts) + "): se propone sin fecha", r.length === 1 && r[0].fecha === null, r);
  }

  console.log("C) «No data found» no es un fallo");
  const avisos = [];
  sb.log = (m, t) => avisos.push([t, m]);
  sb.fetch = async () => ({ json: async () => ({ status: "0", message: "No data found", result: null }) });
  const lista = await sb.etherscanGet({ module: "contract" }, "K", "vault");
  assert("un lote solo de wallets: lista vacía, sin aviso", Array.isArray(lista) && !lista.length && !avisos.length, avisos);

  console.log("D) Cuándo busca y propone");
  const proponerReal = sb.arrProponerVault;
  let buscadas = 0, propuestas = [], clasificaciones = 0, durante = null;
  Object.assign(sb, {
    toast: () => {}, log: () => {}, renderPanel: () => {}, actualizarChipEstado: () => {}, setDot: () => {},
    setProgreso: () => {}, arrPintarSeguro: () => {}, autoGuardarCache: async () => {}, leerConfigDesdeFormulario: () => {},
    configValidaParaSincronizar: () => [], cuadreLeer: async () => {},
    arrClasificarAhora: () => { if (!STATE.csvCargado) return false; clasificaciones++; return true; },
    vaultsCreadosPor: async () => { buscadas++; if (durante) await durante(); return [{ direccion: VAULT, fecha: new Date() }]; },
    arrProponerVault: l => propuestas.push(l),
  });
  let errores = [];
  sb.sincronizar = async () => ({ errores });
  const flujo = async (sincronizar, vault, nueva = true) => {
    if (nueva) { STATE.cache = cacheCon([VAULT]); ARR.vaultsHallados = null; ARR.ultimaPreparacion = null; }
    STATE.config = { wallet: W, vault, etherscan_api_key: "K", compra_bancaria_coste_eur_por_token: 100 };
    STATE.csvCargado = false;
    ARR.preparando = false;
    buscadas = 0; propuestas = []; clasificaciones = 0;
    await sb.arrFlujo({ sincronizar });
  };
  await flujo(true, "");
  assert("tras descargar con el vault vacío: busca y lo propone", buscadas === 1 && propuestas.length === 1, propuestas);
  await flujo(true, "", false);
  assert("otro «🔄 Actualizar» en la sesión: lo vuelve a enseñar sin preguntar a Etherscan", buscadas === 0 && propuestas.length === 1);
  sb.rechazarVault(STATE.cache, VAULT);
  await flujo(true, "", false);
  assert("tras «No es»: ya no sale", buscadas === 0 && !propuestas.length);
  await flujo(true, VAULT2);
  assert("con el vault puesto: ni pregunta a Etherscan", buscadas === 0 && !propuestas.length);
  await flujo(false, "");
  assert("sin descargar (el CSV, abrir la página): no busca", buscadas === 0);
  errores = ["etherscan"];
  await flujo(true, "");
  assert("con la descarga de Etherscan fallida: no busca", buscadas === 0);
  errores = [];
  durante = async () => { STATE.config.vault = VAULT2; };
  await flujo(true, "");
  assert("vault escrito mientras busca: no se propone", buscadas === 1 && !propuestas.length);
  durante = async () => { STATE.config.wallet = dir("c9"); };
  await flujo(true, "");
  assert("wallet cambiada mientras busca: no se propone", buscadas === 1 && !propuestas.length);
  durante = async () => { STATE.csvCargado = true; await sb.arrTrasCargarCsv("r.csv", "x"); };
  await flujo(true, "");
  assert("el CSV cargado mientras busca: se clasifica", clasificaciones >= 1 && ARR.ultimaPreparacion.clasificado, ARR.ultimaPreparacion);
  durante = null;
  sb.vaultsCreadosPor = async () => { buscadas++; return null; };
  await flujo(true, "");
  assert("si la búsqueda falla: nada que proponer", !propuestas.length);
  await flujo(true, "", false);
  assert("y se vuelve a intentar en el siguiente", buscadas === 1);
  sb.vaultsCreadosPor = async () => { throw new Error("x"); };
  await flujo(true, "");
  assert("si revienta: el flujo termina igual", !propuestas.length && !ARR.preparando && ARR.ultimaPreparacion);

  console.log("E) La mini ventana");
  sb.arrProponerVault = proponerReal;
  let actualizados = 0, sucias = 0;
  Object.assign(sb, { arrActualizar: () => { actualizados++; }, marcarCacheDirty: () => { sucias++; } });
  STATE.cache = cacheCon([]);
  const dlg = elemento("arrDlgVault"), html = () => elemento("arrDlgVaultLista").innerHTML;
  const clic = (attr, valor) => dlg.onclick({ target: { closest: sel => (sel === "[" + attr + "]"
    ? { dataset: { [attr === "data-poner" ? "poner" : "noEs"]: valor } } : null) } });
  dlg.open = false;
  sb.arrProponerVault([{ direccion: VAULT, fecha: new Date(Date.UTC(2023, 10, 14, 23, 30)) }, { direccion: VAULT2, fecha: null }]);
  assert("se abre con los dos", dlg.open && elemento("arrDlgVaultTit").textContent === "Vaults probables" && html().includes(VAULT2));
  assert("la fecha, en hora española (23:30 UTC del 14/11 = 15/11)", html().includes("creado por tu wallet el 15/11/2023"), html());
  assert("sin fecha, sin «el»", html().includes(VAULT2 + "</code> creado por tu wallet<div"), html());
  clic("data-no-es", VAULT);
  assert("«No es»: guardado y fuera de la lista", JSON.stringify(STATE.cache.vaults_rechazados) === JSON.stringify([VAULT]) &&
    sucias === 1 && dlg.open && !html().includes(VAULT + "<") && elemento("arrDlgVaultTit").textContent === "Vault probable");
  clic("data-poner", VAULT2);
  assert("«Ponerlo»: escribe el campo, avisa del cambio y descarga", !dlg.open && elemento("cfgVault").value === VAULT2 &&
    elemento("cfgVault").eventos.includes("change") && actualizados === 1);
  sb.arrProponerVault([{ direccion: OTRO, fecha: null }]);
  dlg.close();
  assert("cerrarla sin elegir no es «No es»", STATE.cache.vaults_rechazados.length === 1 && actualizados === 1);
  const pagina = fs.readFileSync(path.join(BASE, "..", "index.html"), "utf8");
  const desde = pagina.indexOf('<dialog id="arrDlgVault"'), ventana = pagina.slice(desde, pagina.indexOf("</dialog>", desde));
  assert("el foco, en «Ahora no» (un Enter al abrirse sola no pone el vault)", /<button value="" autofocus>Ahora no<\/button>/.test(ventana), ventana);

  console.log("\n" + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})();
