/* Test de los arreglos de 🚀 Puesta en marcha. Cada caso falla sin su
 * arreglo.
 *
 * - A1: el archivo de Reental de un archivo abierto antes no entra en el
 *   siguiente (ni en «Empezar de cero»); el cargado sin archivo abierto, sí.
 * - A4: uno de fuera más reciente pero con menos repartos se pregunta al
 *   abrir tu archivo («no» deja el de dentro).
 * - A6: la pregunta dice «trae menos repartos» si termina después.
 * Tu archivo vive en el navegador.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_arreglos_paso_pm.js
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
  appendChild(h) { this.children.push(h); }, setAttribute() {}, querySelector() { return null; }, addEventListener() {},
});
const almacen = {};
const sb = {
  console: Object.assign({}, console, { error: () => {} }),
  document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }), head: { appendChild() {} } },
  localStorage: { setItem: (k, v) => { almacen[k] = String(v); }, getItem: k => almacen[k] ?? null, removeItem: k => { delete almacen[k]; } },
  setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array, Set, Map, BigInt, structuredClone,
};
sb.window = { addEventListener() {} };
sb.location = { hash: "" };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "03-archivos.js", "04-config.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "12-carga-archivos.js", "14-clasificador.js", "19-arranque.js", "24-exportar.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
const STATE = vm.runInContext("state", sb), ARR = vm.runInContext("arr", sb);

const avisos = [], escritos = [], olvidados = [];
let preguntas = [], respuesta = true;
Object.assign(sb, {
  toast: (msg, tipo) => avisos.push([tipo, msg]), log: () => {}, ccEsc: s => String(s ?? ""),
  confirm: m => { preguntas.push(m); return respuesta; },
  escribirArchivoNavegador: async obj => { escritos.push(JSON.parse(JSON.stringify(obj))); },   // js/05
  renderPanel: () => {}, actualizarChipEstado: () => {}, setDot: () => {}, setProgreso: () => {},
  arrFlujo: async () => {}, arrPintarSeguro: () => {},
});

const W = "0x" + "a1".repeat(20), W2 = "0x" + "c3".repeat(20);
const CAB = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
const csv = (fechas, w) => [CAB, ...fechas.map((f, i) => "\"Prueba#" + (i + 1) + "\"," + f + ",2,0,2,0,\"[]\",\"[]\"," + (w || W))].join("\n") + "\n";
const archivo = (w, texto, nombre) => {
  const c = sb.cacheVacia();
  sb.ponerConfiguracionCache(c, { wallet: w, vault: "", inversor: {} });
  if (texto) sb.ponerArchivoRendimientosCache(c, nombre || "dentro.csv", texto, new Date("2026-10-07T10:00:00Z"));
  return JSON.parse(JSON.stringify(c));
};
const limpiar = () => {
  STATE.cache = null; STATE.cacheDirty = false; STATE.registros = null;
  STATE.filasCsv = []; STATE.indicePorHash = {}; STATE.csvCargado = false; STATE.csvArchivo = undefined;
  STATE.config = { wallet: W, vault: "", etherscan_api_key: "K", inversor: {} };
  ARR.csvFueraMasNuevo = false;
  avisos.length = 0; escritos.length = 0; preguntas = []; respuesta = true;
};
// El archivo de Reental de lo último guardado en el navegador.
const dentroDe = () => { const e = escritos[escritos.length - 1]; return e && e.archivo_rendimientos ? e.archivo_rendimientos.texto : null; };
// «📂 Abrir copia» con el archivo elegido.
const elegir = obj => { sb.elegirArchivo = async () => ({ text: async () => JSON.stringify(obj) }); };

(async () => {
  const CA = csv(["2026-01-10", "2026-02-10", "2026-03-10"]), CB = csv(["2025-06-10", "2025-07-10"], W2);

  console.log("A1) El archivo de Reental de un archivo no entra en el siguiente");
  limpiar();
  await sb.arrUsarCache(archivo(W, CA));
  await sb.arrUsarCache(archivo(W2, CB));
  assert("B con su CSV: se queda con el suyo y no se graba el de A", STATE.csvArchivo.texto === CB && dentroDe() !== CA &&
    !ARR.csvFueraMasNuevo && STATE.filasCsv.length === 2, { csv: STATE.csvArchivo.texto.slice(-50), fuera: ARR.csvFueraMasNuevo });
  limpiar();
  await sb.arrUsarCache(archivo(W, CA));
  await sb.arrUsarCache(archivo(W2, null));
  assert("B sin CSV: queda sin archivo de Reental (no hereda el de A)", !STATE.csvCargado && dentroDe() === null &&
    !(STATE.cache.archivo_rendimientos), STATE.csvCargado);
  limpiar();
  await sb.arrUsarCache(archivo(W, CA));
  await sb.arrUsarCache(JSON.parse(JSON.stringify(sb.cacheVacia())));
  assert("una cache nueva con A abierto: no lleva el CSV de A", !STATE.cache.archivo_rendimientos && !STATE.csvCargado);
  limpiar();
  sb.aplicarCsvTexto(CA, false, "cargado.csv");
  await sb.arrUsarCache(archivo(W, null));
  assert("el cargado sin archivo abierto sí entra (como antes)", dentroDe() === CA && STATE.csvArchivo.deArchivo === true);
  await sb.arrUsarCache(archivo(W, null));
  assert("…y no pasa después a otro archivo", !STATE.csvCargado && !STATE.cache.archivo_rendimientos);

  console.log("A4) Uno de fuera más reciente con menos repartos se pregunta");
  const C5 = csv(["2024-06-10", "2024-12-10", "2025-06-10", "2025-12-10", "2026-03-10"]), C1 = csv(["2026-04-10"]);
  limpiar();
  sb.aplicarCsvTexto(C1, false, "parcial.csv");
  respuesta = false;
  await sb.arrUsarCache(archivo(W, C5));
  assert("«no»: se queda el de dentro (5 repartos) y no se graba el parcial", STATE.filasCsv.length === 5 && dentroDe() !== C1 &&
    preguntas.length === 1 && /El archivo de Reental que cargaste trae menos repartos \(1\) que el que ya tienes \(5\)\. ¿Usarlo igualmente\?/.test(preguntas[0]), preguntas);
  limpiar();
  sb.aplicarCsvTexto(C1, false, "parcial.csv");
  await sb.arrUsarCache(archivo(W, C5));
  assert("«sí»: gana el de fuera", STATE.filasCsv.length === 1 && ARR.csvFueraMasNuevo);
  limpiar();
  sb.aplicarCsvTexto(csv(["2024-06-10", "2024-12-10", "2025-06-10", "2025-12-10", "2026-03-10", "2026-04-10"]), false, "completo.csv");
  await sb.arrUsarCache(archivo(W, C5));
  assert("uno más nuevo y más largo: sin preguntar", preguntas.length === 0 && STATE.filasCsv.length === 6);

  console.log("A6) La pregunta al cargar dice lo que pasa");
  const tres = sb.cargarCsvRendimientos(csv(["2026-01-10", "2026-02-10", "2026-03-10"])).filas;
  const dosMasTarde = sb.cargarCsvRendimientos(csv(["2026-01-10", "2026-04-10"])).filas;
  const unoAntes = sb.cargarCsvRendimientos(csv(["2026-01-10"])).filas;
  assert("termina después pero trae menos: «trae menos repartos», no «más antiguo»",
    sb.csvPreguntaMasViejo(dosMasTarde, tres, "Este archivo") === "Este archivo trae menos repartos (2) que el que ya tienes (3). ¿Usarlo igualmente?");
  assert("termina antes: «más antiguo … (hasta …)»",
    sb.csvPreguntaMasViejo(unoAntes, tres, "Este archivo") === "Este archivo es más antiguo que el que ya tienes (hasta 10/03/2026). ¿Usarlo igualmente?");

  console.log("A5) Un config.json elegido con tu archivo abierto no pisa tus datos sin preguntar");
  // Como config.ejemplo.json (la plantilla sin datos); ninguna prueba lee la raíz.
  const ejemplo = { wallet: "0xTU_DIRECCION_DE_WALLET_AQUI", vault: "", etherscan_api_key: "TU-CLAVE-API-DE-ETHERSCAN-AQUI", inversor: { nombre: "Nombre y apellidos", nif: "12345678A" } };
  const abrirConfig = async obj => { elegir(obj); await sb.arrAbrirArchivo(); };
  limpiar();
  await sb.arrUsarCache(archivo(W, CA));
  STATE.config.etherscan_api_key = "MI_CLAVE"; sb.volcarConfigAFormulario();
  await abrirConfig(ejemplo);
  assert("config.ejemplo.json (wallet de ejemplo): se rechaza y nada cambia", STATE.config.wallet === W && STATE.config.etherscan_api_key === "MI_CLAVE" &&
    avisos.some(([t, m]) => t === "error" && /no trae una wallet válida/.test(m)), STATE.config);
  respuesta = false; preguntas = [];
  await abrirConfig({ wallet: W2, etherscan_api_key: "OTRA", inversor: { nombre: "Otro" } });
  assert("uno válido con tu archivo abierto: pregunta; «no» no cambia nada", preguntas.length === 1 && STATE.config.wallet === W &&
    STATE.config.etherscan_api_key === "MI_CLAVE", preguntas);
  respuesta = true;
  await abrirConfig({ wallet: W2, etherscan_api_key: "OTRA", inversor: { nombre: "Otro" } });
  assert("«sí»: usa sus datos", STATE.config.wallet === W2 && STATE.config.etherscan_api_key === "OTRA");

  const conMarca = (c, claves) => Object.assign(c, { copia_de_seguridad: Object.assign({ creada: "2026-10-07T10:00:00Z" }, claves || {}) });

  console.log("A8) Abrir una copia con tus datos escritos pregunta");
  limpiar();
  sb.volcarConfigAFormulario();
  respuesta = false;
  elegir(conMarca(archivo(W2, CB), { etherscan_api_key: "VIEJA" }));
  await sb.arrAbrirArchivo();
  assert("sin archivo abierto pero con wallet y API key escritas: pregunta; «no» no cambia nada",
    preguntas.length === 1 && /¿Abrir la copia del/.test(preguntas[0]) && STATE.cache === null && STATE.config.etherscan_api_key === "K", preguntas);

  console.log("COPIA-1) Dos copias seguidas");
  limpiar();
  STATE.config = {}; sb.volcarConfigAFormulario();   // nada: la primera no pregunta (A8)
  elegir(conMarca(archivo(W, CA))); await sb.arrAbrirArchivo();
  elegir(conMarca(archivo(W2, CB))); await sb.arrAbrirArchivo();
  assert("la segunda pregunta y cada una se guarda en el navegador sin su marca",
    preguntas.length === 1 && escritos.length >= 2 && escritos.every(o => !("copia_de_seguridad" in o)) && dentroDe() === CB,
    { preguntas, escritos: escritos.length });

  console.log("A11) Una copia o tu archivo mal escritos no se abren");
  for (const [nombre, obj] of [["copia con tipos_bce: null", conMarca(Object.assign(archivo(W, CA), { tipos_bce: null }))],
      ["tu archivo con una transacción null", (() => { const c = archivo(W, CA); c.transacciones.wallet_tokens.push(null); return c; })()]]) {
    limpiar();
    const antes = JSON.stringify(STATE.config);
    elegir(obj);
    await sb.arrAbrirArchivo();
    assert(nombre + ": aviso y nada cambia (ni las API keys)", STATE.cache === null && JSON.stringify(STATE.config) === antes &&
      avisos.some(([t, m]) => t === "error" && m === "Ese archivo está mal escrito y no se puede abrir. No ha cambiado nada."), avisos);
  }

  console.log("A7) Tus datos de dentro mal escritos no se pisan al abrir; solo espacios no borran los tuyos");
  for (const malo of [{ wallet: W, vault: W2, inversor: "Ana" }, { wallet: W, vault: "", inversor: { nif: 12345678 } }]) {
    limpiar();
    STATE.config = { wallet: "", vault: "", inversor: {} };   // otro ordenador: nada en el navegador
    const a = archivo(W, CA); a.configuracion = malo;
    await sb.arrUsarCache(a);
    assert("bloque " + JSON.stringify(malo).slice(0, 40) + "…: se queda como estaba en tu archivo",
      JSON.stringify(STATE.cache.configuracion) === JSON.stringify(malo) && !escritos.some(o => o.configuracion && o.configuracion.wallet === ""),
      STATE.cache.configuracion);
  }
  limpiar();
  const espacios = archivo(W, CA); espacios.configuracion = { wallet: "   ", vault: "", inversor: { nombre: "  ", nif: "" } };
  STATE.config.inversor = { nombre: "Ana" };
  await sb.arrUsarCache(espacios);
  assert("wallet y nombre con solo espacios: se quedan los tuyos", STATE.config.wallet === W && STATE.config.inversor.nombre === "Ana", STATE.config);

  console.log("A12) No se hace una copia mientras se descarga");
  limpiar();
  await sb.arrUsarCache(archivo(W, CA));
  const guardadas = [];
  sb.descargarJson = n => { guardadas.push(n); };
  ARR.preparando = true;
  await sb.exHacerCopia();
  assert("con una descarga en marcha: ni copia ni botón activo", guardadas.length === 0 && vm.runInContext("exCopiaApagada()", sb) === true);
  ARR.preparando = false;
  await sb.exHacerCopia();
  assert("al terminar: sí", guardadas.length === 1 && vm.runInContext("exCopiaApagada()", sb) === false);

  console.log("A13) «Última copia» sin la casilla no dice «tus datos»");
  STATE.config.inversor = { nombre: "Ana", nif: "0T" };
  assert("sin la casilla: solo transacciones y repartos", sb.exTextoLleva(sb.exResumenAhora(false)) === "0 transacciones · 3 repartos",
    sb.exTextoLleva(sb.exResumenAhora(false)));
  assert("con ella: tus datos y API keys", /tus datos y API keys$/.test(sb.exTextoLleva(sb.exResumenAhora(true))));

  console.log("A14) Un autoguardado que acaba tarde no da por guardada otra cache");
  limpiar();
  await sb.arrUsarCache(archivo(W, CA));
  let soltar;
  sb.escribirArchivoNavegador = () => new Promise(r => { soltar = r; });
  STATE.cacheDirty = true;
  const enVuelo = sb.autoGuardarCache();
  await new Promise(r => setTimeout(r, 0));
  STATE.cache = archivo(W, CB); STATE.cacheDirty = true;   // se abrió una copia
  soltar(); await enVuelo;
  assert("la copia abierta sigue por guardar", STATE.cacheDirty === true);
  sb.escribirArchivoNavegador = async obj => { escritos.push(JSON.parse(JSON.stringify(obj))); };

  console.log("A15) El número de «🔍 Ir a Revisión» es el del menú de 🔍");
  limpiar();
  sb.ccColaRevision = () => [{}, {}];   // js/15: 2 por decidir (una venta por vincular, aunque no esté marcada)
  sb.ccContextoSesion = () => ({});
  STATE.cache = archivo(W, CA); STATE.registros = [{ revisar: false }]; ARR.ultimaPreparacion = { sincronizado: false };
  sb.arrPintar = vm.runInContext("arrPintar", sb);
  elemento("arrTarjeta"); elemento("arrFin");
  try { vm.runInContext("arrPintar()", sb); } catch (e) { /* el resto de la tarjeta, sin su HTML */ }
  assert("«🔍 Ir a Revisión (2)», aunque ninguno esté marcado", /Ir a Revisión \(2\)/.test(elemento("arrFin").innerHTML), elemento("arrFin").innerHTML.slice(-160));

  console.log("Texto 1) «✅ Todo listo.» solo sin avisos debajo");
  const resumen = d => sb.arrResumen(Object.assign({ cacheOk: true, csvOk: true, configOk: true, keyOk: true, vaultConfigurado: true,
    clasificacion: { inmuebles: 3 } }, d));
  assert("sin avisos: «✅ Todo listo.»", resumen({}).titulo === "✅ Todo listo.");
  assert("con avisos (ningún inmueble): «⚠ Listo, con avisos.»", resumen({ clasificacion: { inmuebles: 0 } }).titulo === "⚠ Listo, con avisos.");
  assert("con la descarga fallida: también", resumen({ prep: { sincronizado: true, erroresSync: ["bce"], nuevas: 0, total: 1 } }).titulo === "⚠ Listo, con avisos.");

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
