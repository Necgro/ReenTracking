/* Test unitario de «todo automático» en 🚀 Puesta en marcha.
 *
 * Bajo prueba:
 * - js/02: direccionValida / direccionesConfigOk (la config solo
 *   reclasifica con formato 0x + 40), arrHuellaConfig (el NIF o la key no
 *   cambian el resultado), arrEvaluar (`puedeActualizar` no pide el CSV) y
 *   arrResumen (el resumen único: clasificación, espera del CSV, descarga,
 *   vault ✓/⚠, fechas sin precio, propiedades, tokens con dudas, guardado).
 * - js/14-clasificador.js: modo silencioso de ejecutarClasificacion (sin
 *   avisos flotantes, registro de una línea, devuelve true/false y deja
 *   state.ultimaClasificacion); sin opciones, el modo normal.
 * - js/09-sincronizacion.js: sincronizar(modo, {silencioso}) sin avisos, el
 *   vault en ámbar si NO cuadra o no se pudo leer y lo que devuelve.
 * - js/02-utilidades.js: log() abre el registro plegado solo con un error.
 * - js/12-carga-archivos.js: el CSV se aplica desde su texto y avisa a js/19.
 *
 * DATOS 100% SINTÉTICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_arranque_paso_ui7d.js
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

/* Sandbox con un DOM mínimo y permisivo: cualquier id devuelve un elemento
   falso (los módulos solo leen/escriben propiedades sueltas). */
function nuevoSandbox(archivos, campos) {
  const elementos = {};
  const elemento = id => (elementos[id] = elementos[id] || {
    id, value: (campos || {})[id] || "", disabled: false, hidden: false, open: false, innerHTML: "", textContent: "",
    dataset: {}, style: {}, scrollTop: 0, scrollHeight: 0, children: [],
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    appendChild(h) { this.children.push(h); }, setAttribute() {}, querySelector() { return null; },
  });
  const sb = {
    console: Object.assign({}, console, { error: () => {} }),
    document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }) },
    __elementos: elementos,
    setTimeout, Promise, Date, JSON, Math, Object, Array, Set, Map, BigInt,
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of archivos) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  }
  return sb;
}
const ev = (sb, expr) => vm.runInContext(expr, sb);

const W = "0x" + "a1".repeat(20), V = "0x" + "b2".repeat(20);

/* ============ A) Direcciones y config para la clasificación automática ============ */
console.log("A) La config solo reclasifica con direcciones válidas (T47b)");
let sb = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "04-config.js", "14-clasificador.js", "19-arranque.js"]);
assert("0x + 40 hexadecimales es válida (mayúsculas también)",
  sb.direccionValida(W) && sb.direccionValida("0x" + "AB".repeat(20)) && sb.direccionValida("  " + W + " "));
assert("a medio escribir, sin 0x, con letras raras o vacía no lo es",
  ["0x1234", "a1".repeat(21), "0x" + "g1".repeat(20), "", null, undefined, "0x" + "a1".repeat(21)]
    .every(x => !sb.direccionValida(x)));
assert("wallet válida y vault vacío (opcional) → sí", sb.direccionesConfigOk({ wallet: W, vault: "" }) && sb.direccionesConfigOk({ wallet: W }));
assert("wallet y vault válidos → sí", sb.direccionesConfigOk({ wallet: W, vault: V }));
assert("vault a medio escribir → no", !sb.direccionesConfigOk({ wallet: W, vault: "0xb2b2" }));
assert("wallet a medio escribir o ausente → no",
  !sb.direccionesConfigOk({ wallet: "0xa1", vault: V }) && !sb.direccionesConfigOk({}) && !sb.direccionesConfigOk(null));
assert("la huella solo mira wallet y vault (normalizadas): el NIF o la key no reclasifican",
  sb.arrHuellaConfig({ wallet: W, vault: V, etherscan_api_key: "A", inversor: { nif: "1" } }) ===
  sb.arrHuellaConfig({ wallet: W.toUpperCase().replace("0X", "0x"), vault: V, etherscan_api_key: "B", inversor: { nif: "2" } }) &&
  sb.arrHuellaConfig({ wallet: W, vault: V }) !== sb.arrHuellaConfig({ wallet: W, vault: "" }));

/* ============ B) «🔄 Actualizar» no necesita el CSV ============ */
console.log("B) arrEvaluar: «🔄 Actualizar» (T35)");
const CFG = { wallet: W, vault: V, etherscan_api_key: "K", compra_bancaria_coste_eur_por_token: 100 };
let r = sb.arrEvaluar({ config: CFG, cache: { transacciones: {} }, csvCargado: false, nCsv: 0, registros: null });
assert("con config y cache, sin CSV: se puede actualizar (sincroniza y espera al CSV)", r.puedeActualizar && !r.puedeClasificar, r);
assert("…y la lista sigue pidiendo el CSV", r.faltan.length === 1 && r.faltan[0].paso === "csv", r.faltan);
r = sb.arrEvaluar({ config: Object.assign({}, CFG, { etherscan_api_key: "" }), cache: {}, csvCargado: true, nCsv: 1, registros: null });
assert("sin API key no se puede actualizar", !r.puedeActualizar, r);
r = sb.arrEvaluar({ config: CFG, cache: null, csvCargado: true, nCsv: 1, registros: null });
assert("sin cache no se puede actualizar", !r.puedeActualizar);
r = sb.arrEvaluar({ config: CFG, cache: {}, csvCargado: true, nCsv: 1, registros: null, preparando: true });
assert("con un flujo en marcha no se relanza", !r.puedeActualizar);
assert("ya no existe `puedePreparar` (el botón «▶ Iniciar» pasó a «🔄 Actualizar»)", !("puedePreparar" in r));

/* ============ C) El resumen único ============ */
console.log("C) arrResumen: el resumen único (T35/T47d)");
const base = { clasificacion: null, csvOk: true, configOk: true, keyOk: true, prep: null,
  vaultConfigurado: true, vault: null, fechasSinPrecio: 0, candidatas: 0, cacheOk: true,
  errorGuardar: false, conArchivo: true, nombreArchivo: "reental_cache.json" };
const res = d => sb.arrResumen(Object.assign({}, base, d));
const textos = x => x.lineas.map(l => l.tipo + ":" + l.texto);
let s = res({ clasificacion: { registros: 549, revisar: 0, inmuebles: 18 } });
// «✅ Todo listo.» y sin la línea de guardado (ya la dice la de tu archivo).
assert("titular corto", s.titulo === "✅ Todo listo.", s.titulo);
assert("con todo bien y guardado solo: ninguna línea", textos(s).length === 0, textos(s));
s = res({ csvOk: false });
assert("sin CSV: «carga el CSV y clasifico al momento»", /Carga el archivo de rendimientos de Reental\./.test(s.titulo), s.titulo);
s = res({ configOk: false, csvOk: false });
assert("sin wallet válida, pide la wallet antes que el CSV", /Completa tu dirección de wallet \(tus datos\)/.test(s.titulo), s.titulo);
s = res({ cacheOk: false, csvOk: false });
assert("sin cache no hay titular ni líneas de cache", s.titulo === null && s.lineas.length === 0, s);
s = res({ prep: { sincronizado: true, erroresSync: [], nuevas: 12, total: 584 } });
assert("descarga con novedades: «12 nuevas (584 en total)»", textos(s).some(t => t === "ok:Transacciones: <b>12</b> nuevas (584 en total)."), textos(s));
s = res({ prep: { sincronizado: true, erroresSync: [], nuevas: 0, total: 584 } });
assert("descarga sin novedades: «al día»", textos(s).some(t => /^ok:Transacciones: nada nuevo \(584 en total\)/.test(t)), textos(s));
s = res({ prep: { sincronizado: true, erroresSync: ["bce", "rnt"], nuevas: 0, total: 584 } });
assert("descarga con errores: ámbar, qué pasos y que se usó lo que había",
  textos(s).some(t => /^warn:La descarga falló en: bce, rnt\. Se usó lo que ya había/.test(t)) &&
  !textos(s).some(t => /Transacciones:/.test(t)), textos(s));
s = res({ keyOk: false });
assert("sin API key: línea informativa que lleva a tus datos",
  s.lineas.some(l => l.tipo === "info" && /falta la API key/.test(l.texto) && l.accion && l.accion.ir === "arrDatos"), s.lineas);
s = res({ vaultConfigurado: false });
assert("sin vault: los rendimientos salen igual; falta el contraste y el saldo (DIV-1.9, T66 resuelta)",
  textos(s).some(t => /^info:Sin vault \(es opcional\): no se contrastan los rendimientos ni su saldo\./.test(t)) &&
  !textos(s).some(t => /no se ven/.test(t)), textos(s));
const prepOk = { sincronizado: true, erroresSync: [], nuevas: 0, total: 1 };
s = res({ prep: prepOk, vault: { coincide: true, saldo_calculado_usdt: 5, saldo_onchain_usdt: 5, diferencia_usdt: 0 } });
assert("vault que cuadra: verde con el saldo", textos(s).some(t => t === "ok:Vault: el saldo cuadra (5,00 USDT)."), textos(s));
s = res({ prep: prepOk, vault: { coincide: false, saldo_calculado_usdt: 10, saldo_onchain_usdt: 12.345, diferencia_usdt: -2.345 } });
assert("vault que NO cuadra: ámbar con calculado, red y diferencia (T47d)",
  textos(s).some(t => /^warn:Vault: el saldo NO cuadra\. Calculado 10,00 USDT, en la red 12,35 USDT \(diferencia -2,35 USDT\)/.test(t)), textos(s));
s = res({ prep: prepOk, vault: { coincide: null, saldo_calculado_usdt: 10, saldo_onchain_usdt: null, diferencia_usdt: null } });
assert("vault ilegible: ámbar, nunca verde", textos(s).some(t => /^warn:Vault: no se pudo leer/.test(t)), textos(s));
s = res({ prep: null, vault: { coincide: false } });
assert("sin descarga en esta sesión no se habla del vault", !textos(s).some(t => /Vault/.test(t)), textos(s));
s = res({ fechasSinPrecio: 1 });
assert("1 fecha sin precio (singular) con acceso a la tabla",
  s.lineas.some(l => l.tipo === "warn" && /^1 fecha sin precio de RNT: ponlas a mano en 🔍 Revisión\./.test(l.texto) && l.accion.fn === "fechas"), s.lineas);
s = res({ fechasSinPrecio: 7 });
assert("7 fechas sin precio (plural)", textos(s).some(t => /^warn:7 fechas sin precio/.test(t)), textos(s));
s = res({ clasificacion: { registros: 30, revisar: 25, inmuebles: 0 } });
assert("ningún inmueble reconocido: aviso", textos(s).some(t => /^warn:Ningún inmueble reconocido/.test(t)), textos(s));
s = res({ candidatas: 2 });
assert("2 tokens con dudas, con acceso al catálogo",
  s.lineas.some(l => /^2 tokens con dudas: no cuentan/.test(l.texto) && l.accion.fn === "catalogo"), s.lineas);
s = res({ candidatas: 1 });
assert("1 token con dudas (singular)", textos(s).some(t => /1 token con dudas: no cuenta como/.test(t)), textos(s));
// Se guarda solo; si el navegador no deja, ámbar con salto a la copia.
s = res({ errorGuardar: true });
assert("no se pudo guardar en el navegador: ámbar con salto a «🗂️ Guardar copia»",
  s.lineas.some(l => l.tipo === "warn" && /No se pudo guardar en este navegador/.test(l.texto) && l.accion.ir === "arrTarjeta") &&
  !textos(s).some(t => /Guardado en/.test(t)), s.lineas);
// El aviso suave de la copia, tras descargar y con datos, a partir de 30 días (o sin ninguna).
const prepCopia = { sincronizado: true, erroresSync: [], nuevas: 0, total: 3 };
const lineaCopia = d => res(Object.assign({ prep: prepCopia, hayDatos: true }, d)).lineas.find(l => /copia/.test(l.texto));
assert("sin ninguna copia: aviso suave (info) con salto", (lineaCopia({ copiaDias: null }) || {}).tipo === "info" &&
  /ninguna copia/.test(lineaCopia({ copiaDias: null }).texto) && lineaCopia({ copiaDias: null }).accion.ir === "arrTarjeta");
assert("hace 30 días: aviso con los días", /hace 30 días/.test((lineaCopia({ copiaDias: 30 }) || {}).texto || ""));
assert("hace 29 días: sin aviso", !lineaCopia({ copiaDias: 29 }));
assert("sin datos o sin descargar: sin aviso", !lineaCopia({ copiaDias: null, hayDatos: false }) && !lineaCopia({ copiaDias: 90, prep: null }));
s = res({ nombreArchivo: "<mi>.json" });
// Sin la línea «Guardado en…», el nombre del archivo no sale en el resumen.
assert("el nombre del archivo no sale en el resumen (ni sin escapar)", !textos(s).some(t => /<mi>|mi&gt;/.test(t)), textos(s));

/* ============ D) Modo silencioso de js/14 ============ */
console.log("D) ejecutarClasificacion en modo silencioso (js/14)");
sb = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"]);
ev(sb, "var __toasts = [], __logs = []; toast = function (m, t) { __toasts.push([t, m]); }; log = function (m, t) { __logs.push([t || 'info', m]); };");
ev(sb, "state.config = { wallet: '" + W + "', vault: '" + V + "', compra_bancaria_coste_eur_por_token: 100 };");
ev(sb, "state.cache = cacheVacia(); state.csvCargado = false; state.filasCsv = [];");
let v = ev(sb, "ejecutarClasificacion({ silencioso: true })");
assert("sin CSV y en silencio: devuelve false y no avisa", v === false && ev(sb, "__toasts.length") === 0);
v = ev(sb, "ejecutarClasificacion()");
assert("sin CSV y sin opciones: avisa como antes", v === false && ev(sb, "__toasts.length") === 1 && /Falta el archivo de rendimientos/.test(ev(sb, "__toasts[0][1]")));
ev(sb, "state.csvCargado = true; state.filasCsv = [{ linea_csv: 2, inmueble: 'X', importe: 0, distributed: 0, retained: 0, hashes: [] }]; state.indicePorHash = {}; __toasts = []; __logs = [];");
v = ev(sb, "ejecutarClasificacion({ silencioso: true, detalle: false })");
assert("en silencio y sin detalle: clasifica y devuelve true", v === true && Array.isArray(ev(sb, "state.registros")));
assert("…sin ningún aviso flotante (tampoco «no se ha reconocido ninguna propiedad»)", ev(sb, "__toasts.length") === 0, ev(sb, "__toasts"));
assert("…y el registro en UNA línea de clasificación",
  ev(sb, "__logs.filter(l => /Clasificaci/.test(l[1])).length") === 1 &&
  /^Clasificación automática: 0 registros · 0 a revisar\.$/.test(ev(sb, "__logs.filter(l => /Clasificaci/.test(l[1]))[0][1]")), ev(sb, "__logs"));
assert("deja el resultado para el resumen (state.ultimaClasificacion)",
  ev(sb, "JSON.stringify([state.ultimaClasificacion.registros, state.ultimaClasificacion.revisar, state.ultimaClasificacion.inmuebles])") === "[0,0,0]");
ev(sb, "__toasts = []; __logs = [];");
v = ev(sb, "ejecutarClasificacion({ silencioso: true })");
assert("en silencio con detalle: registro completo («Libro diario…») y sin avisos",
  v === true && ev(sb, "__logs.some(l => /^Libro diario/.test(l[1]))") && ev(sb, "__toasts.length") === 0);
ev(sb, "__toasts = [];");
v = ev(sb, "ejecutarClasificacion()");
assert("sin opciones: el aviso «Clasificación completada» de siempre",
  v === true && ev(sb, "__toasts.some(t => /Clasificación completada/.test(t[1]))"), ev(sb, "__toasts"));

/* ============ E) sincronizar(modo, {silencioso}) y el vault ámbar (js/09) ============ */
console.log("E) sincronizar en silencio y vault honesto (js/09, T47d)");
async function probarSync() {
  const campos = { cfgWallet: W, cfgVault: V, cfgEthKey: "K", cfgNombre: "", cfgNif: "" };
  const s2 = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "09-sincronizacion.js"], campos);
  ev(s2, "var __toasts = [], __dots = {}; toast = function (m, t) { __toasts.push([t, m]); }; log = function () {};" +
    "setDot = function (p, e) { __dots[p] = e; }; setProgreso = function (p, t) { globalThis.__prog = t; }; setBotonesSync = function () {};" +
    "renderPanel = function () {}; actualizarChipEstado = function () {}; marcarCacheDirty = function () { state.cacheDirty = true; };" +
    "autoGuardarCache = async function () {}; guardarConfigLocalSilencioso = function () {};" +
    "state.cache = cacheVacia(); state.cacheHandle = null;" +
    "pasoEtherscan = async function () {}; pasoBce = async function () {}; pasoRnt = async function () {};" +
    "var __vault = { coincide: false, saldo_calculado_usdt: 1, saldo_onchain_usdt: 2, diferencia_usdt: -1 };" +
    "pasoVault = async function () { state.sync.vault = __vault; return __vault; };");
  let r1 = await ev(s2, "sincronizar('todo', { silencioso: true })");
  assert("devuelve qué pasó: sin errores y el resultado del vault",
    r1 && Array.isArray(r1.errores) && r1.errores.length === 0 && r1.vault && r1.vault.coincide === false, r1);
  assert("vault que NO cuadra → indicador «warn», no «ok»", ev(s2, "__dots.vault") === "warn", ev(s2, "__dots"));
  assert("en silencio: sin el aviso «Guarda la cache» aunque quede sin guardar",
    ev(s2, "state.cacheDirty") === true && ev(s2, "__toasts.length") === 0, ev(s2, "__toasts"));
  ev(s2, "__vault = { coincide: null }; __toasts = [];");
  await ev(s2, "sincronizar('todo', { silencioso: true })");
  assert("vault ilegible → «warn»", ev(s2, "__dots.vault") === "warn");
  ev(s2, "__vault = { coincide: true };");
  await ev(s2, "sincronizar('todo')");
  assert("vault que cuadra → «ok»; sin opciones tampoco pide guardar (ALMACEN-1: se guarda solo)",
    ev(s2, "__dots.vault") === "ok" && !ev(s2, "__toasts.some(t => /Guarda/.test(t[1]))"), ev(s2, "__toasts"));
  ev(s2, "pasoBce = async function () { throw new Error('caído'); }; __toasts = [];");
  r1 = await ev(s2, "sincronizar('todo', { silencioso: true })");
  assert("un paso que falla sale en `errores`, en rojo, y la barra no dice «completa»",
    JSON.stringify(r1.errores) === '["bce"]' && ev(s2, "__dots.bce") === "err" &&
    /Terminada con errores en: bce/.test(ev(s2, "globalThis.__prog")), [r1, ev(s2, "globalThis.__prog")]);
  ev(s2, "state.config.vault = ''; document.getElementById('cfgVault').value = ''; __dots = {};");
  r1 = await ev(s2, "sincronizar('todo', { silencioso: true })");
  // Al empezar se vacían los 4 indicadores; sin vault el suyo se queda vacío.
  assert("sin vault (opcional) no se verifica ni se pinta", ev(s2, "__dots.vault") === "" && r1.vault === null, ev(s2, "__dots"));
  ev(s2, "state.sync.running = true;");
  assert("si ya hay una sincronización en marcha devuelve null", (await ev(s2, "sincronizar('todo')")) === null);
}

/* ============ F) Registro plegado (js/02) y CSV desde su texto (js/12) ============ */
async function probarLogYCsv() {
  console.log("F) Registro técnico plegado (js/02, T40) y CSV (js/12)");
  const s3 = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "10-csv-descubrimiento.js", "12-carga-archivos.js"]);
  const reg = s3.document.getElementById("arrRegistro");
  s3.log("hola"); s3.log("cuidado", "warn");
  assert("log normal o de aviso: el registro sigue plegado", reg.open === false);
  s3.log("se rompió", "error");
  assert("log de error: se abre solo", reg.open === true);
  ev(s3, "var __toasts = [], __aviso = null; toast = function (m, t) { __toasts.push([t, m]); }; actualizarChipEstado = function () {};" +
    "arrTrasCargarCsv = async function (n, t) { __aviso = [n, t.length]; };");
  const CSV = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet\n" +
    "\"Prueba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;
  await s3.cargarCsv({ name: "mio.csv", text: async () => CSV });
  assert("cargarCsv aplica el texto y avisa a js/19 con el nombre y el texto",
    ev(s3, "state.csvCargado && state.filasCsv.length") === 1 && ev(s3, "JSON.stringify(__aviso)") === JSON.stringify(["mio.csv", CSV.length]), ev(s3, "__aviso"));
  ev(s3, "__toasts = []; state.csvCargado = false;");
  // Sin el resumen largo de #resumenCsv (oculto).
  assert("aplicarCsvTexto(recordado): carga sin aviso flotante",
    s3.aplicarCsvTexto(CSV, true) === true && ev(s3, "__toasts.length") === 0);
  ev(s3, "__aviso = null;");
  await s3.cargarCsv({ name: "roto.csv", text: async () => "no,es,un,csv\n" });
  assert("un CSV inválido no avisa a js/19 (no se borra ni se recuerda nada)", ev(s3, "__aviso") === null);
}

(async () => {
  await probarSync();
  await probarLogYCsv();
  /* ============ G) Pureza ============ */
  console.log("G) Pureza de lo nuevo");
  const js19 = fs.readFileSync(path.join(BASE, "19-arranque.js"), "utf8");
  // direccionValida y direccionesConfigOk viven en js/02.
  const js19y02 = js19 + "\n" + fs.readFileSync(path.join(BASE, "02-utilidades.js"), "utf8");
  const cuerpo = n => (js19y02.match(new RegExp("function " + n + "\\([\\s\\S]*?\\r?\\n}\\r?\\n")) || [""])[0];
  assert("arrResumen, direccionesConfigOk y direccionValida no tocan el DOM ni el estado global",
    ["arrResumen", "direccionesConfigOk", "direccionValida", "arrHuellaConfig"].every(n => {
      const c = cuerpo(n); return c && !/\$\(|document\.|state\.|arr\.\w+\s*=/.test(c);
    }));
  // El CSV no se recuerda aparte (va dentro de tu archivo). En
  // localStorage, solo los avisos a las otras pestañas; tu archivo va en
  // IndexedDB (js/05).
  assert("js/19 no guarda el CSV aparte y en localStorage solo los avisos a las otras pestañas",
    !/"csv"\)/.test(js19) && !/localStorage\.setItem\((?!ARR_SENAL_OLVIDAR,|ARR_SENAL_GUARDADO,)/.test(js19) &&
    /localStorage\.setItem\(ARR_SENAL_OLVIDAR, [^;]*\);\s*localStorage\.removeItem\(ARR_SENAL_OLVIDAR\)/.test(js19));
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
