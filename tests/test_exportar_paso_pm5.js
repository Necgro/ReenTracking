/* Test: la copia de seguridad es tu archivo, y se hace en 🚀.
 *
 * Bajo prueba:
 * - exArmarCopia (js/24): un duplicado de tu archivo + la marca
 *   copia_de_seguridad con su fecha (solo la fecha); con la casilla (de
 *   entrada), las API keys, el nombre y el NIF en «configuracion», como tu
 *   archivo; sin ella, ninguno. No toca la cache.
 * - exClavesDeCopia: solo las claves escritas (texto con algo).
 * - exHacerCopia: lo abierto ahora (también sin guardar), con la casilla de
 *   «Tus datos» (js/04), «Última copia» y, sin archivo abierto, nada.
 *   Siempre se descarga, como reental_cache_AAAA-MM-DD_HHMM.json.
 * - arrAbrirArchivo (js/19, «📂 Abrir copia») con la copia: sin la marca, pasa
 *   a ser lo de este navegador con las mismas cifras; sus claves pasan al navegador; una
 *   copia sin claves ni nombre no borra los tuyos; una copia de formato antiguo
 *   (claves en la marca) se sigue leyendo.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_exportar_paso_pm5.js
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
  id, value: "", checked: false, disabled: false, hidden: false, open: false, innerHTML: "", textContent: "",
  dataset: {}, style: {}, children: [],
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(h) { this.children.push(h); }, setAttribute() {}, querySelector() { return null; },
  addEventListener() {},
});
const almacen = {};
const sb = {
  console: Object.assign({}, console, { error: () => {} }),
  document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }), head: { appendChild() {} } },
  localStorage: { setItem: (k, v) => { almacen[k] = String(v); }, getItem: k => almacen[k] ?? null, removeItem: k => { delete almacen[k]; } },
  setTimeout, Promise, Date, JSON, Math, Object, Array, Set, Map, BigInt, structuredClone,
};
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "12-carga-archivos.js", "14-clasificador.js", "24-exportar.js", "19-arranque.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
const STATE = vm.runInContext("state", sb);

const avisos = [], guardadas = [];
let usos = [];
Object.assign(sb, {
  toast: (msg, tipo) => avisos.push([tipo, msg]), log: () => {}, confirm: () => true,
  descargarJson: (nombre, obj) => { guardadas.push([nombre, JSON.parse(JSON.stringify(obj))]); },
  ccEsc: s => String(s ?? ""), arrOlvidarRecordado: async () => {}, arrNumTx: c => (c.transacciones.wallet_tokens || []).length,
});

const W = "0x" + "a1".repeat(20), W2 = "0x" + "c3".repeat(20);
const ETH = "CLAVE_ETH_SINTETICA", CG = "CLAVE_CG_SINTETICA";
const CAB = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
const CSV = [CAB, "\"Prueba#1\",2026-01-10,2,0,2,0,\"[]\",\"[]\"," + W].join("\n") + "\n";
const config = () => ({ wallet: W, vault: "", etherscan_api_key: ETH, coingecko_api_key: CG, inversor: { nombre: "Ana", nif: "00000000T" } });
const cacheBase = () => {
  const c = sb.cacheVacia();
  c.transacciones.wallet_tokens.push({ hash: "0x" + "ab".repeat(32), value: "1" });
  sb.ponerConfiguracionCache(c, config());
  sb.ponerArchivoRendimientosCache(c, "reental.csv", CSV, new Date("2026-10-07T10:00:00Z"));
  return c;
};
const ahora = new Date(2026, 9, 7, 10, 53);
const json = o => JSON.parse(JSON.stringify(o));

(async () => {
  console.log("A) La copia con la casilla marcada");
  const cache = cacheBase();
  sb.ponerConfiguracionCache(cache, config(), true);   // tu archivo con la casilla marcada
  const antes = JSON.stringify(cache);
  const copia = json(sb.exArmarCopia({ cache, config: config(), incluirDatos: true, ahora }));
  const { copia_de_seguridad: marca, ...resto } = copia;
  assert("es tu archivo tal cual + la marca", JSON.stringify(resto) === antes, Object.keys(copia));
  assert("la marca: solo la fecha", JSON.stringify(marca) === JSON.stringify({ creada: ahora.toISOString() }), marca);
  assert("las claves, en «configuracion» (como tu archivo)", copia.configuracion.etherscan_api_key === ETH && copia.configuracion.coingecko_api_key === CG,
    copia.configuracion);
  assert("con tu nombre, NIF y el archivo de Reental", copia.configuracion.inversor.nif === "00000000T" &&
    sb.leerArchivoRendimientosCache(copia).texto === CSV);
  assert("la cache abierta no cambia", JSON.stringify(cache) === antes && !("copia_de_seguridad" in cache));
  assert("es tu archivo para «📂 Abrir copia»: tipo copia", sb.arrTipoArchivo(copia) === "copia");

  console.log("B) Sin la casilla");
  const sin = json(sb.exArmarCopia({ cache, config: config(), incluirDatos: false, ahora }));
  assert("ni claves ni nombre ni NIF en todo el archivo", !/CLAVE|Ana|00000000T/.test(JSON.stringify(sin)), sin.copia_de_seguridad);
  assert("la wallet se queda", sin.configuracion.wallet === W && sb.arrTipoArchivo(sin) === "copia");

  console.log("C) Claves raras");
  const rara = json(sb.exArmarCopia({ cache, config: { wallet: W, etherscan_api_key: "  ", coingecko_api_key: 123 }, incluirDatos: true, ahora }));
  assert("vacías o que no son texto: van vacías y la marca solo lleva la fecha", rara.configuracion.etherscan_api_key === "" &&
    rara.configuracion.coingecko_api_key === "" && Object.keys(rara.copia_de_seguridad).join() === "creada", rara);
  assert("exClavesDeCopia: null, lista o texto dan {}", ["x", null, [], 7].every(o => JSON.stringify(sb.exClavesDeCopia(o)) === "{}"));
  assert("y quita los espacios de alrededor", sb.exClavesDeCopia({ etherscan_api_key: " K " }).etherscan_api_key === "K");

  console.log("D) «🗂️ Guardar copia»");
  STATE.cache = null; STATE.config = config(); sb.volcarConfigAFormulario();
  await sb.exHacerCopia();
  assert("sin archivo abierto: nada que copiar", guardadas.length === 0 && avisos.some(([t, m]) => t === "warn" && m === "Nada que copiar todavía."));
  STATE.cache = cacheBase(); STATE.filasCsv = [{}]; almacen.reental_datos_en_archivo = "si";
  elemento("cfgWallet").value = W2;   // escrito ahora, aún sin guardar en tu archivo
  vm.runInContext("exEstado.copiaHecha = 0", sb); await sb.exHacerCopia();   // no es un doble clic
  const [nombre, guardada] = guardadas[0] || [];
  assert("nombre con la fecha y la hora (ALMACEN-1: reental_cache_…)", /^reental_cache_\d{4}-\d{2}-\d{2}_\d{4}\.json$/.test(nombre), nombre);
  assert("lleva lo escrito ahora y las claves", guardada.configuracion.wallet === W2 && guardada.configuracion.etherscan_api_key === ETH);
  const ultima = sb.exUltimaCopia();
  assert("«Última copia» lo apunta, con API keys", ultima && ultima.archivo === nombre && ultima.claves === true && ultima.movimientos === 1 &&
    ultima.repartos === 1, ultima);
  assert("y se pinta en 🚀 (hoy)", /Última copia: <b>hoy/.test(elemento("exUltima").innerHTML) && !elemento("btnCopia").disabled);
  almacen.reental_datos_en_archivo = "no";   // la casilla de «Tus datos», desmarcada
  vm.runInContext("exEstado.copiaHecha = 0", sb); await sb.exHacerCopia();   // no es un doble clic
  assert("desmarcada: sin claves, y «Última copia» lo sabe", !JSON.stringify(guardadas[1][1]).includes("CLAVE") && sb.exUltimaCopia().claves === false);

  const antesDoble = guardadas.length;
  vm.runInContext("exEstado.copiaHecha = 0", sb);
  const r1 = await sb.exHacerCopia(), r2 = await sb.exHacerCopia();
  assert("ALMACEN-1 A12: un doble clic descarga una sola copia", r1 === true && r2 === false && guardadas.length === antesDoble + 1);
  // «Guardar copia y olvidar» se fía de lo que devuelve.
  vm.runInContext("exEstado.copiaHecha = 0; arr.preparando = true;", sb);
  const ocupada = await sb.exHacerCopia();
  vm.runInContext("arr.preparando = false;", sb);
  const cacheAntes = STATE.cache; STATE.cache = null;
  const sinCache = await sb.exHacerCopia();
  STATE.cache = cacheAntes;
  const descargarBueno = sb.descargarJson;
  sb.descargarJson = () => { throw new Error("sin sitio"); };
  const falla = await sb.exHacerCopia();
  sb.descargarJson = descargarBueno;
  assert("devuelve false si está ocupada, sin datos o si la descarga falla", ocupada === false && sinCache === false && falla === false &&
    guardadas.length === antesDoble + 1);

  console.log("E) Abrir la copia con «📂 Abrir copia»");
  sb.arrUsarCache = async (o, leido) => { usos.push([o, leido]); sb.configDesdeCache(o); sb.guardarConfigLocalSilencioso(); };
  almacen.reental_datos_en_archivo = "si";
  const abrir = async obj => { usos = []; sb.elegirArchivo = async () => ({ text: async () => JSON.stringify(obj) }); await sb.arrAbrirArchivo(); };
  STATE.cache = null; STATE.config = { wallet: "", etherscan_api_key: "", inversor: {} }; sb.volcarConfigAFormulario();
  await abrir(guardada);
  // Pasa a ser lo de este navegador, sin la marca, y descarga lo nuevo (sin `leido`).
  assert("sin la marca, y descarga lo nuevo", usos.length === 1 && usos[0][1] === undefined && !("copia_de_seguridad" in usos[0][0]) &&
    avisos.some(([t, m]) => t === "ok" && /^Copia del \d\d\/\d\d\/2026 \d\d:\d\d abierta\.$/.test(m)));
  assert("sus claves pasan al navegador y al formulario", STATE.config.etherscan_api_key === ETH && STATE.config.coingecko_api_key === CG &&
    elemento("cfgEthKey").value === ETH && JSON.parse(almacen.reental_config).etherscan_api_key === ETH);
  assert("ida y vuelta: las mismas cifras (movimientos y archivo de Reental) y tus datos",
    sb.arrNumTx(usos[0][0]) === 1 && sb.leerArchivoRendimientosCache(usos[0][0]).texto === CSV && usos[0][0].configuracion.wallet === W2 &&
    usos[0][0].configuracion.inversor.nif === "00000000T");
  STATE.config = { wallet: W2, etherscan_api_key: "MIA", coingecko_api_key: "MIA_CG", inversor: { nombre: "Ana" } };   // la wallet de la copia
  sb.volcarConfigAFormulario();
  await abrir(guardadas[1][1]);
  assert("una copia sin claves no borra las tuyas", STATE.config.etherscan_api_key === "MIA" && STATE.config.coingecko_api_key === "MIA_CG" &&
    elemento("cfgEthKey").value === "MIA");
  // Una copia de formato antiguo: las claves en la marca, no en «configuracion».
  const pm5 = json(cacheBase());
  pm5.copia_de_seguridad = { creada: "2026-10-07T08:00:00Z", etherscan_api_key: "DE_PM5", coingecko_api_key: "CG_PM5" };
  await abrir(pm5);
  assert("una copia de PM-5 se sigue leyendo: sus claves pasan al navegador", usos.length === 1 && STATE.config.etherscan_api_key === "DE_PM5" &&
    STATE.config.coingecko_api_key === "CG_PM5" && !("copia_de_seguridad" in usos[0][0]), STATE.config);

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
