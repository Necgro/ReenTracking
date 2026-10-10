/* Test unitario del «arranque limpio»: la config dentro de 🚀 Puesta en
 * marcha, sin lo que sobra y con 100 €/token fijo; el botón al final, la
 * clasificación sin tarjeta y la sincronización junto al registro.
 *
 * Bajo prueba:
 * - js/04-config.js: aplicarReglasFijasConfig + leerConfigDesdeFormulario +
 *   volcarConfigAFormulario. El coste de las compras bancarias es una REGLA
 *   FIJA de 100 € por token en los TRES caminos de entrada de la config
 *   (formulario, config.json del disco y copia del navegador) y se escribe al
 *   exportar; la retención, la fecha de adquisición y la key de CoinGecko ya
 *   no se editan pero NO se pierden.
 * - js/19-arranque.js: arrAlias con #config (la pestaña ⚙️ Config ya no
 *   existe: lleva a la tarjeta 1) sin romper #sync / #clasificacion / #panel;
 *   arrEvaluar sigue pidiendo lo mismo que requisitosClasificacionOk (js/14)
 *   y, con el coste ya fijado, nunca lo lista como pendiente.
 *
 * DATOS 100% SINTÉTICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_arranque_paso_ui7c.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");

/* Sandbox con un DOM mínimo: solo los campos que quedan en la
   tarjeta 1 de Puesta en marcha. Si js/04 leyera un campo retirado
   (cfgCgKey, cfgCosteToken, cfgFechaAdq, cfgRetencion) reventaría aquí. */
function nuevoSandbox(campos) {
  const elementos = {};
  for (const [id, valor] of Object.entries(campos)) elementos[id] = { value: valor };
  const sb = {
    console: Object.assign({}, console, { error: () => {} }),
    document: { getElementById: id => elementos[id] || null },
    __elementos: elementos,
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js",
                   "14-clasificador.js", "19-arranque.js"]) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  }
  vm.runInContext("log = function () {}; toast = function () {};", sb);
  return sb;
}

// `state` y las constantes de los módulos son `const` dentro del contexto: no
// aparecen como propiedades del sandbox, así que se leen evaluando ahí dentro
// (las funciones sí son accesibles como propiedades).
const ev = (sb, expr) => vm.runInContext(expr, sb);
const cfgDe = sb => vm.runInContext("JSON.parse(JSON.stringify(state.config))", sb);

const CAMPOS_TARJETA1 = ["cfgWallet", "cfgVault", "cfgEthKey", "cfgNombre", "cfgNif"];
const RETIRADOS = ["cfgCgKey", "cfgCosteToken", "cfgFechaAdq", "cfgRetencion"];

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "a1".repeat(20), V = "0x" + "b2".repeat(20);
const CFG_OK_BIS = { wallet: W, vault: V, etherscan_api_key: "K", compra_bancaria_coste_eur_por_token: 100 };

/* ============ A) Camino 1: el formulario de la tarjeta 1 ============ */
console.log("A) Camino 1 · formulario de 🚀 Puesta en marcha");
let sb = nuevoSandbox({ cfgWallet: "  0x" + "A1".repeat(20) + " ", cfgVault: V,
  cfgEthKey: "  CLAVE_SINTETICA  ", cfgNombre: " Nombre Sintético ", cfgNif: " 00000000T " });
vm.runInContext("state.config = {}; leerConfigDesdeFormulario();", sb);
let cfg = cfgDe(sb);
assert("lee wallet/vault normalizados y la key sin espacios",
  cfg.wallet === W && cfg.vault === V && cfg.etherscan_api_key === "CLAVE_SINTETICA", cfg);
assert("lee nombre y NIF del plegable «Datos para tus informes»",
  cfg.inversor.nombre === "Nombre Sintético" && cfg.inversor.nif === "00000000T", cfg.inversor);
assert("fija 100 € por token sin pedirlo (T46)", cfg.compra_bancaria_coste_eur_por_token === 100, cfg);
assert("rellena la retención (19 %) y la fecha de adquisición vacía",
  cfg.retencion_irpf_pct === 19 && cfg.fecha_adquisicion_token === null, cfg);
assert("no lee ningún campo retirado de la interfaz (" + RETIRADOS.join(", ") + ")",
  RETIRADOS.every(id => sb.document.getElementById(id) === null));
assert("volcarConfigAFormulario escribe solo los 5 campos que quedan", (() => {
  vm.runInContext("state.config.wallet = '0x' + 'cc'.repeat(20); volcarConfigAFormulario();", sb);
  return sb.__elementos.cfgWallet.value === "0x" + "cc".repeat(20) &&
    CAMPOS_TARJETA1.every(id => typeof sb.__elementos[id].value === "string");
})(), sb.__elementos);

/* ============ B) Camino 2: config.json del disco ============ */
console.log("B) Camino 2 · config.json del disco (y exportación)");
sb = nuevoSandbox({ cfgWallet: "", cfgVault: "", cfgEthKey: "", cfgNombre: "", cfgNif: "" });
const DEL_DISCO = {
  etherscan_api_key: "CLAVE_DISCO", coingecko_api_key: "CG_SINTETICA", wallet: W, vault: V,
  inversor: { nombre: "Nombre Disco", nif: "11111111H" },
  compra_bancaria_coste_eur_por_token: 137.5, // valor distinto: se sustituye
  fecha_adquisicion_token: "2024-01-15", retencion_irpf_pct: 23, extra_desconocido: { a: 1 },
};
vm.runInContext("state.config = aplicarReglasFijasConfig(" + JSON.stringify(DEL_DISCO) + ");", sb);
cfg = cfgDe(sb);
assert("un coste distinto en el archivo se sustituye por los 100 € fijos",
  cfg.compra_bancaria_coste_eur_por_token === 100, cfg.compra_bancaria_coste_eur_por_token);
assert("conserva retención, fecha y key de CoinGecko del archivo (no se editan, no se pierden)",
  cfg.retencion_irpf_pct === 23 && cfg.fecha_adquisicion_token === "2024-01-15" &&
  cfg.coingecko_api_key === "CG_SINTETICA", cfg);
assert("conserva claves desconocidas del archivo", JSON.stringify(cfg.extra_desconocido) === '{"a":1}');
assert("al exportar (leerConfigDesdeFormulario, que usa guardarConfigDisco) se escriben los 100 €", (() => {
  vm.runInContext("volcarConfigAFormulario(); leerConfigDesdeFormulario();", sb);
  const c = cfgDe(sb);
  return c.compra_bancaria_coste_eur_por_token === 100 && c.inversor.nombre === "Nombre Disco" && c.wallet === W;
})(), cfgDe(sb));
assert("aplicarReglasFijasConfig tolera null y devuelve un objeto usable",
  vm.runInContext("aplicarReglasFijasConfig(null).compra_bancaria_coste_eur_por_token", sb) === 100);
assert("la constante del módulo es 100", ev(sb, "COSTE_BANCARIA_EUR_POR_TOKEN") === 100);

/* ============ C) Camino 3: copia del navegador al arrancar ============ */
console.log("C) Camino 3 · copia guardada en el navegador");
sb = nuevoSandbox({ cfgWallet: "", cfgVault: "", cfgEthKey: "", cfgNombre: "", cfgNif: "" });
// Lo que hace js/13 al arrancar: parsear el localStorage y aplicar las reglas.
const GUARDADA = { wallet: W, vault: V, etherscan_api_key: "CLAVE_LS" }; // sin coste (config vieja)
vm.runInContext("state.config = " + JSON.stringify(GUARDADA) + "; aplicarReglasFijasConfig(state.config); volcarConfigAFormulario();", sb);
assert("una config guardada SIN coste arranca con los 100 € fijos",
  cfgDe(sb).compra_bancaria_coste_eur_por_token === 100, cfgDe(sb));
assert("los campos de la tarjeta 1 quedan volcados", sb.__elementos.cfgWallet.value === W &&
  sb.__elementos.cfgEthKey.value === "CLAVE_LS", sb.__elementos);
assert("con eso, js/14 ya da los requisitos de config por buenos", (() => {
  ev(sb, "state.cache = { transacciones: { wallet_tokens: [] } }; state.csvCargado = true; state.filasCsv = [{}];");
  const r = sb.requisitosClasificacionOk();
  return r.configOk && r.cacheOk && r.csvOk;
})(), sb.requisitosClasificacionOk());
assert("y el asistente no lista el precio por token como pendiente",
  sb.arrEvaluar({ config: cfgDe(sb), cache: ev(sb, "state.cache"), csvCargado: true, nCsv: 1, registros: null })
    .faltan.length === 0);

/* ============ D) El asistente sigue pidiendo lo mismo que js/14 ============ */
console.log("D) Paridad con requisitosClasificacionOk (js/14)");
const CFG_OK = { wallet: W, vault: V, etherscan_api_key: "K", compra_bancaria_coste_eur_por_token: 100 };
const casos = [
  { config: CFG_OK, cache: {}, csvCargado: true, nCsv: 2 },
  { config: Object.assign({}, CFG_OK, { compra_bancaria_coste_eur_por_token: 0 }), cache: {}, csvCargado: true, nCsv: 2 },
  { config: Object.assign({}, CFG_OK, { wallet: "" }), cache: {}, csvCargado: true, nCsv: 2 },
  { config: CFG_OK, cache: null, csvCargado: true, nCsv: 2 },
  { config: CFG_OK, cache: {}, csvCargado: false, nCsv: 0 },
];
let iguales = 0;
for (const c of casos) {
  vm.runInContext("state.config = " + JSON.stringify(c.config) + "; state.cache = " + JSON.stringify(c.cache) +
    "; state.csvCargado = " + c.csvCargado + "; state.filasCsv = " + JSON.stringify(Array.from({ length: c.nCsv }, () => ({}))) + ";", sb);
  const q = sb.requisitosClasificacionOk();
  const ev = sb.arrEvaluar({ config: c.config, cache: c.cache, csvCargado: c.csvCargado, nCsv: c.nCsv, registros: null });
  if ((q.cacheOk && q.csvOk && q.configOk) === ev.puedeClasificar) iguales++;
}
assert("5/5 casos: puedeClasificar ≡ requisitosClasificacionOk", iguales === casos.length, iguales);
assert("si faltara el coste (config a mano), se sigue diciendo con honestidad",
  /€ por token/.test(sb.arrEvaluar({ config: Object.assign({}, CFG_OK, { compra_bancaria_coste_eur_por_token: null }),
    cache: {}, csvCargado: true, nCsv: 1, registros: null }).faltan[0].texto));

/* ============ E-bis) Menos denso ============ */
console.log("E-bis) Parche UI-7c-bis · menos denso");
// Sin barra de pasos (una sola tarjeta).
assert("sin barra de pasos (PM-4: una sola tarjeta)", ev(sb, "typeof ARR_STEPPER") === "undefined");
assert("el CSV se llama «Archivo de rendimientos» (T54)",
  ev(sb, "ARR_TITULOS.csv") === "Archivo de rendimientos");
const faltanTodo = sb.arrEvaluar({ config: {}, cache: null, csvCargado: false, nCsv: 0, registros: null }).faltan;
assert("lo que falta habla en llano, sin «Paso 1, 2, 3» (PM-4)",
  faltanTodo.map(f => f.paso).join() === "config,csv" && !faltanTodo.some(f => /Paso \d/.test(f.texto)) &&
  /archivo de rendimientos/.test(faltanTodo[1].texto), faltanTodo.map(f => f.texto));   // tu archivo nunca falta
assert("el archivo cargado se cuenta en «repartos» (glosario REND), no en «dividendos»",
  /repartos/.test(sb.arrEvaluar({ config: CFG_OK_BIS, cache: {}, csvCargado: true, nCsv: 7, registros: null }).pasos.csv.texto));

/* ============ E-vault) El vault es opcional ============ */
console.log("E-vault) La dirección del vault es opcional");
sb = nuevoSandbox({ cfgWallet: W, cfgVault: "", cfgEthKey: "K", cfgNombre: "", cfgNif: "" });
ev(sb, "state.config = {}; leerConfigDesdeFormulario(); state.cache = { transacciones: { wallet_tokens: [] } };" +
       "state.csvCargado = true; state.filasCsv = [{}];");
assert("sin vault, los requisitos de clasificar (js/14) salen en verde",
  sb.requisitosClasificacionOk().configOk, sb.requisitosClasificacionOk());
assert("sin vault, tampoco bloquea sincronizar (js/04)",
  ev(sb, "JSON.stringify(configValidaParaSincronizar())") === "[]",
  ev(sb, "JSON.stringify(configValidaParaSincronizar())"));
let evv = sb.arrEvaluar({ config: { wallet: W, etherscan_api_key: "K", compra_bancaria_coste_eur_por_token: 100 },
  cache: {}, csvCargado: true, nCsv: 1, registros: null });
assert("sin vault, el asistente deja pulsar «▶ Iniciar» y no lo lista como pendiente",
  evv.puedeActualizar && evv.faltan.length === 0 && !/vault/i.test(JSON.stringify(evv.pasos.config)), evv.pasos.config);
evv = sb.arrEvaluar({ config: { vault: V, etherscan_api_key: "K", compra_bancaria_coste_eur_por_token: 100 },
  cache: {}, csvCargado: true, nCsv: 1, registros: null });
assert("la wallet SÍ sigue siendo obligatoria", !evv.puedeActualizar && /wallet/.test(evv.faltan[0].texto), evv.faltan);
assert("una dirección vacía nunca se toma por el vault (guarda esDelVault)",
  ev(sb, 'esDelVault("")') === false && ev(sb, 'esDelVault(null)') === false);
assert("con vault puesto, esDelVault se comporta como la comparación de siempre",
  ev(sb, 'state.config.vault = "' + V + '"; [esDelVault("' + V.toUpperCase() + '"), esDelVault("' + W + '")].join()') === "true,false");
const idx = fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "index.html"), "utf8");
assert("el campo del vault se presenta como «(opcional)» con burbuja ⓘ de ventajas (DIV-1.9: el contraste y el saldo)",
  /Dirección del Vault Reental <span class="arr-opcional">\(opcional\)<\/span>/.test(idx) &&
  /arr-info[^>]*title="El vault es la cuenta de Reental[^"]*con o sin vault[^"]*contrasta cada rendimiento[^"]*comprueba el saldo del vault/.test(idx) &&
  !/NO se ven los dividendos|no se ven tus dividendos/.test(idx));
assert("la SPA ya no habla del programa de Python (apps independientes)",
  !/reental\.py|programa de Python|motor Python/.test(idx.replace(/<!--[\s\S]*?-->/g, "")),
  (idx.match(/.{0,50}(reental\.py|Python).{0,50}/g) || []).slice(0, 3));

/* ============ E-ter) Botón al final, avisos y catálogo ============ */
console.log("E-ter) Botón al final, avisos que llevan a su sitio y catálogo repintado");
const html = fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "index.html"), "utf8");
const vistaInicio = (html.match(/<section id="view-inicio"[\s\S]*?<\/section>/) || [""])[0];
const pos = id => vistaInicio.indexOf('id="' + id + '"');
// Una tarjeta (tu archivo, tus datos y el archivo de Reental) y el botón al final.
assert("T57 · el botón «🔄 Actualizar» va DESPUÉS de lo que hay que preparar",
  pos("btnAbrirArchivo") < pos("arrDatos") && pos("arrDatos") < pos("dzCsv") &&
  pos("dzCsv") < pos("arrPreparar") && pos("arrPreparar") < pos("arrPasoSync"),
  { archivo: pos("btnAbrirArchivo"), datos: pos("arrDatos"), csv: pos("dzCsv"),
    boton: pos("arrPreparar"), sync: pos("arrPasoSync") });
const js08 = fs.readFileSync(path.join(BASE, "08-coingecko.js"), "utf8");
const js09b = fs.readFileSync(path.join(BASE, "09-sincronizacion.js"), "utf8");
const js10 = fs.readFileSync(path.join(BASE, "10-csv-descubrimiento.js"), "utf8");
const js14b = fs.readFileSync(path.join(BASE, "14-clasificador.js"), "utf8");
const sinComentarios = src => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
assert("T58 · ningún aviso de precios de RNT, de cache o de catálogo manda ya a la pestaña 🛠️ Panel",
  ![js08, js09b, js10, js14b].some(src => /🛠️ Panel/.test(sinComentarios(src))),
  [["08", js08], ["09", js09b], ["10", js10], ["14", js14b]]
    .filter(([, src]) => /🛠️ Panel/.test(sinComentarios(src))).map(([n]) => n));
assert("T58 · el aviso de fechas sin precio lleva DIRECTO a su tabla de 🔍 Revisión",
  /function irAFechasSinPrecio\(\)[\s\S]{0,260}location\.hash = "#revision"[\s\S]{0,200}tablaPreciosRntFaltantes/.test(js09b) &&
  /texto: "Ir a las fechas sin precio", fn: irAFechasSinPrecio/.test(js09b));
assert("T59 · tras el Descubrimiento automático se repinta el catálogo de 🔍 Revisión",
  /descubrimientoAntesDeClasificar[\s\S]*?if \(typeof renderPanel === "function"\) renderPanel\(\);/.test(js14b));

/* ============ E) Direcciones antiguas: #config incluido ============ */
console.log("E) Direcciones antiguas (la pestaña ⚙️ Config ya no existe)");
const aCfg = sb.arrAlias("#config");
assert("#clasificacion lleva a la tarjeta de sincronización, donde vive el resultado (T50)",
  sb.arrAlias("#clasificacion").ancla === "arrPasoSync", sb.arrAlias("#clasificacion"));
assert("#config → Puesta en marcha, tus datos (PM-4)",
  aCfg && aCfg.vista === "inicio" && aCfg.ancla === "arrDatos", aCfg);
assert("#sync sigue llevando a su tarjeta",
  sb.arrAlias("#sync").ancla === "arrPasoSync" && sb.arrAlias("clasificacion").vista === "inicio");
assert("#panel heredado sigue llevando a Revisión", sb.arrAlias("#panel").vista === "revision");
assert("las vistas vigentes no se tocan",
  ["#inicio", "#revision", "#transacciones", "#dashboard", "#exportar", "", null].every(h => sb.arrAlias(h) === null));

/* ============ F) El espejo arr* desaparece ============ */
console.log("F) Sin espejo de campos (T34)");
const js19 = fs.readFileSync(path.join(BASE, "19-arranque.js"), "utf8");
assert("js/19 ya no tiene espejo ni campos arrWallet/arrVault/arrEthKey/arrCoste",
  !/ARR_ESPEJO|arrVolcarEspejo|arrMontarEspejo|arrWallet|arrVault|arrEthKey|arrCoste/.test(js19));
// El botón es «🔄 Actualizar» a propósito.
assert("js/19 pinta el botón «🔄 Actualizar» (antes «▶ Iniciar», T52 → UI-7d) y no «Preparar y clasificar»",
  /"🔄 Actualizar"/.test(js19) && !/textContent = .*Preparar y clasificar/.test(js19));
assert("la tarjeta de sincronización solo se enseña tras pulsar Iniciar (T51)",
  /cardSync\.hidden = !\(arr\.preparando/.test(js19), (js19.match(/cardSync[\s\S]{0,160}/) || [""])[0].slice(0, 160));
assert("js/19 escucha los campos cfg* de la tarjeta 1",
  /ARR_CAMPOS_CONFIG\s*=\s*\["cfgWallet", "cfgVault", "cfgEthKey", "cfgNombre", "cfgNif"\]/.test(js19));
const js13 = fs.readFileSync(path.join(BASE, "13-inicio.js"), "utf8");
assert("js/13 no cablea los botones retirados (T41-T43, T47e)",
  !/btnDescubrimiento|btnClasificar|btnSyncTodo|btnSyncEth|btnSyncBce|btnSyncRnt|btnProbarGuardado|btnGuardarConfigLocal|btnGuardarCacheDash|dzDatos/.test(js13));
assert("js/13 aplica las reglas fijas de la config al arrancar",
  /aplicarReglasFijasConfig\(state\.config\)/.test(js13));
// Sin «✨ Empezar de cero»: para empezar de nuevo, «🧹 Olvidar todo».
assert("sin «✨ Empezar de cero» (ALMACEN-1)", !/btnNuevaCache|arrEmpezarDeCero/.test(js13 + js19));
const js12 = fs.readFileSync(path.join(BASE, "12-carga-archivos.js"), "utf8");
assert("js/12 ya no carga reental_datos.json (T41)", !/cargarDatosJson|state\.datos/.test(js12));
const js02 = fs.readFileSync(path.join(BASE, "02-utilidades.js"), "utf8");
assert("setBotonesSync tolera que los botones de sincronizar ya no existan (T43)",
  /setBotonesSync[\s\S]{0,320}if \(el\) el\.disabled/.test(js02) && !/state\.datos/.test(js02));
const js09 = fs.readFileSync(path.join(BASE, "09-sincronizacion.js"), "utf8");
assert("js/09 ya no pide guardar: se guarda solo (ALMACEN-1)", !/Guarda tu archivo|guardarCacheDisco/.test(js09));
const bloqueFaltan = (js09.match(/if \(faltan\.length\) \{[\s\S]*?\n  \}/) || [""])[0];
assert("js/09 ya no dice que las fechas sin precio «se marcarán REVISAR» (falso: el clasificador no usa precios)",
  !/se marcarán REVISAR/.test(js09) && /ponlas a mano en 🔍 Revisión/.test(bloqueFaltan), bloqueFaltan.slice(0, 120));
assert("js/09 avisa de las fechas sin precio UNA vez (un log y un aviso, T47c)",
  (bloqueFaltan.match(/\blog\(/g) || []).length === 1 && (bloqueFaltan.match(/\btoast\(/g) || []).length === 1,
  bloqueFaltan.slice(0, 120));

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
