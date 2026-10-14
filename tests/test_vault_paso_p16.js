/* P16: «🔍 Buscar mi vault» en 🚀, junto al campo del vault.
 *
 * Bajo prueba (js/19):
 * - arrPuedeBuscarVault: el botón sale con el vault vacío, la wallet y la API
 *   key escritas y algo descargado; no mientras se descarga.
 * - arrBuscarVault(true) (el botón): pregunta otra vez a Etherscan aunque ya
 *   se buscara en la sesión, enseña también los que dijiste «No es» y
 *   devuelve cuántos enseña (0 si ninguno, null si Etherscan falla). Sin
 *   pedirlo (tras una descarga), como antes: una vez por wallet y sesión y
 *   sin los rechazados.
 *
 * DATOS 100% SINTÉTICOS. Ejecución: node tests/test_vault_paso_p16.js
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
  addEventListener() {}, dispatchEvent() {}, showModal() { this.open = true; }, close() { this.open = false; },
});
const sb = {
  console: Object.assign({}, console, { error: () => {} }),
  document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }) },
  localStorage: { setItem() {}, getItem: () => null, removeItem() {} },
  location: { hash: "" },
  setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array, Set, Map, BigInt,
};
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "06-etherscan.js", "10-csv-descubrimiento.js",
                 "12-carga-archivos.js", "14-clasificador.js", "24-exportar.js", "19-arranque.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
const ev = expr => vm.runInContext(expr, sb);
const STATE = ev("state"), ARR = ev("arr");

const W = "0x" + "a1".repeat(20), V1 = "0x" + "b1".repeat(20), V2 = "0x" + "b2".repeat(20), OTRO = "0x" + "c9".repeat(20);
const KEY = "TEST_SINTETICA";

console.log("== 1. Cuándo sale el botón ==");
const P = (cfg, nTx = 5, prep = false) => sb.arrPuedeBuscarVault(cfg, nTx, prep);
const base = { wallet: W, vault: "", etherscan_api_key: KEY };
assert("vault vacío, wallet, key y algo descargado: sale", P(base) === true);
assert("con el vault escrito: no", P(Object.assign({}, base, { vault: V1 })) === false);
assert("sin nada descargado: no", P(base, 0) === false);
assert("mientras se descarga: no", P(base, 5, true) === false);
assert("sin API key: no", P(Object.assign({}, base, { etherscan_api_key: "  " })) === false);
assert("con la wallet mal escrita: no", P(Object.assign({}, base, { wallet: "0x123" })) === false);
assert("sin config: no", P(null) === false);

console.log("== 2. Lo que hace al pulsarlo ==");
let consultas = 0, respuesta = [];
Object.assign(sb, {
  log: () => {}, toast: () => {}, leerConfigDesdeFormulario: () => {},
  // Como Etherscan: solo contesta por las direcciones que se le preguntan.
  vaultsCreadosPor: async candidatos => { consultas++; return respuesta && respuesta.filter(v => candidatos.includes(v.direccion)); },
});
let propuestos = null;
sb.arrProponerVault = lista => { propuestos = lista.map(v => v.direccion); };
STATE.config = Object.assign({}, base);
STATE.cache = sb.asegurarEstructuraCache(sb.cacheVacia());
STATE.cache.transacciones.wallet_normales.push({ hash: "0x1", from: W, to: V1 }, { hash: "0x2", from: W, to: OTRO }, { hash: "0x3", from: W, to: V2 });
ARR.vaultsHallados = null;

(async () => {
  respuesta = [{ direccion: V1, fecha: "2024-03-01T10:00:00Z" }];
  let n = await sb.arrBuscarVault(false);
  assert("tras una descarga: lo propone", n === 1 && JSON.stringify(propuestos) === JSON.stringify([V1]) && consultas === 1, [n, propuestos]);
  sb.rechazarVault(STATE.cache, V1);
  propuestos = null;
  n = await sb.arrBuscarVault(false);
  assert("tras una descarga, con «No es»: ni pregunta otra vez ni lo propone", n === 0 && propuestos === null && consultas === 1, [n, consultas]);
  n = await sb.arrBuscarVault(true);
  assert("el botón: pregunta otra vez y lo enseña aunque dijeras «No es»", n === 1 && JSON.stringify(propuestos) === JSON.stringify([V1]) &&
    consultas === 2, [n, propuestos, consultas]);
  respuesta = [];
  propuestos = null;
  n = await sb.arrBuscarVault(true);
  assert("el botón sin nada que proponer: 0 y sin ventana", n === 0 && propuestos === null, n);
  respuesta = null;
  n = await sb.arrBuscarVault(true);
  assert("si Etherscan falla: null", n === null && propuestos === null, n);
  respuesta = [{ direccion: V1 }, { direccion: V2 }];
  STATE.config.vault = V2;
  n = await sb.arrBuscarVault(true);
  assert("si mientras buscaba escribiste el vault: no abre la ventana", propuestos === null, propuestos);

  assert("candidatos: sin pedirlo, sin los rechazados; con el botón, también ellos",
    !sb.vaultCandidatos(STATE.cache, W).includes(V1) && sb.vaultCandidatos(STATE.cache, W, true).includes(V1));

  console.log("== 3. El botón en la pantalla ==");
  STATE.config.vault = "";
  respuesta = [];
  await sb.arrPulsarBuscarVault();
  assert("sin nada: «Ningún vault creado por tu wallet.» y el botón como estaba",
    elemento("arrBuscarVaultNota").textContent === "Ningún vault creado por tu wallet." && !elemento("btnBuscarVault").disabled &&
    elemento("btnBuscarVault").textContent === "🔍 Buscar mi vault", elemento("arrBuscarVaultNota").textContent);
  respuesta = null;
  await sb.arrPulsarBuscarVault();
  assert("con Etherscan caído: «No se pudo buscar en Etherscan.»", elemento("arrBuscarVaultNota").textContent === "No se pudo buscar en Etherscan.");
  respuesta = [{ direccion: V1 }];
  await sb.arrPulsarBuscarVault();
  assert("con uno: sin nota (sale la ventana)", elemento("arrBuscarVaultNota").textContent === "" && JSON.stringify(propuestos) === JSON.stringify([V1]));

  const html = fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "index.html"), "utf8");
  console.log("== 4. Auditoría ==");
  const c2 = sb.asegurarEstructuraCache(sb.cacheVacia());
  c2.direcciones_descargadas = { wallet: OTRO };
  assert("F3: con lo descargado de otra wallet, sin botón (hasta descargar)", P(base, 5, false) === true &&
    sb.arrPuedeBuscarVault(base, 5, false, c2) === false);
  // F4: una búsqueda a la vez.
  ARR.buscandoVault = true;
  consultas = 0;
  assert("F4: con una búsqueda en marcha, otra no pregunta a Etherscan", (await sb.arrBuscarVault(true)) === null && consultas === 0);
  ARR.buscandoVault = false;
  // F5: si cambias la wallet mientras busca, ni ventana ni «Ningún vault…».
  respuesta = [];
  propuestos = null;
  const real = sb.vaultsCreadosPor;
  sb.vaultsCreadosPor = async c => { STATE.config.wallet = OTRO; return real(c); };
  await sb.arrPulsarBuscarVault();
  STATE.config.wallet = W;
  sb.vaultsCreadosPor = real;
  assert("F5: wallet cambiada mientras buscaba: sin nota falsa", ARR.notaVault === null, ARR.notaVault);
  respuesta = [];
  await sb.arrPulsarBuscarVault();
  assert("F5: la nota va con la wallet y la key con que se buscó", ARR.notaVault && ARR.notaVault.texto === "Ningún vault creado por tu wallet." &&
    ARR.notaVault.huella === sb.arrHuellaVault(STATE.config), ARR.notaVault);
  assert("F5: con otra key, ya no vale", sb.arrHuellaVault(Object.assign({}, STATE.config, { etherscan_api_key: "OTRA" })) !== ARR.notaVault.huella);
  assert("F4: al terminar, sin búsqueda en marcha", ARR.buscandoVault === false);

  assert("index.html: el botón dentro del campo del vault, oculto de entrada",
    /<input id="cfgVault"[^>]*><div id="arrBuscarVaultCaja" class="help" hidden><button type="button" id="btnBuscarVault">🔍 Buscar mi vault<\/button>/.test(html));

  console.log("\n" + ok + " OK, " + fallos + " FALLOS");
  process.exit(fallos ? 1 : 0);
})();
