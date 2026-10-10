/* PARIDAD de qué fechas pide la app
 * a la red.
 *
 * Por cada escenario de los casos (con tus datos y su «hoy»), la app hace
 * sus pasos de la sincronización de verdad (pasoBce y pasoRnt, que llama a
 * pasoPol: js/09) con lo que va a la red sustituido por grabadoras
 * (actualizarTiposBce, precioRntHistorico y precioPolHistorico), en sus
 * dos momentos: en un «🔄 Actualizar» con la clasificación de antes y
 * justo al abrir tu archivo, sin clasificación (puede pedir MENOS fechas
 * de POL, las que el motor necesita, en el «Actualizar» siguiente; nunca
 * otras). Compara las fechas de BCE, RNT y POL
 * de los dos con las cifras de referencia de la app.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/paridad_fechas_pedidas_paso_fase82.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { leerCasos, referencia } = require("./cifras_referencia.js");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const DATOS = path.join(__dirname, "..", "privado", "datos_reales");
const datos = leerCasos("paridad_fechas_82.json");

const MODULOS = ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "08-coingecko.js", "09-sincronizacion.js",
  "10-csv-descubrimiento.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js", "11-panel.js",
  "21-fiscal.js", "22-informe-renta.js"];
const CODIGO = MODULOS.map(f => [f, fs.readFileSync(path.join(BASE, f), "utf8")]);
const leer = f => fs.readFileSync(path.join(DATOS, f), "utf8");
const cacheReal = leer("reental_cache.json");
const configReal = JSON.parse(leer("config.json"));
const csv = leer(fs.existsSync(path.join(DATOS, "reental_rendimientos.csv")) ? "reental_rendimientos.csv" : "reental_dividendos.csv");
const nodo = () => ({ children: [], dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
  appendChild(c) { this.children.push(c); return c; }, setAttribute() {}, addEventListener() {}, querySelectorAll() { return []; } });

/* La sincronización de la app sobre ese escenario; conClasificacion: con
   la clasificación de antes (un «Actualizar») o recién abierto (sin ella). */
async function pedidoDeLaApp(caso, conClasificacion) {
  const [modo, vinculos, tercero] = caso.nombre.split("/");
  const sinPrecios = tercero === "sin_precios";
  const sb = { console, URLSearchParams, structuredClone, document: { getElementById: () => nodo(), createElement: () => nodo() } };
  sb.globalThis = sb;
  vm.createContext(sb);
  // El «hoy» del caso (también el Date.now() de pasoPol).
  const fijo = Date.parse(caso.hoy + "T12:00:00Z");
  vm.runInContext("const __D = Date; Date = class extends __D { constructor(...a) { if (a.length) super(...a); else super(" + fijo +
    "); } static now() { return " + fijo + "; } };", sb);
  for (const [f, codigo] of CODIGO) vm.runInContext(codigo, sb, { filename: f });
  vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sb);  // los casos son en UTC
  const cache = JSON.parse(cacheReal);
  if (modo === "sin_vault_ni_series") { cache.transacciones.vault_normales = []; cache.transacciones.vault_tokens = []; }
  if (vinculos === "sin_vinculos") cache.pagos_diferidos = { version: 1, ventas: [] };
  if (sinPrecios) {
    for (const campo of ["precios_rnt", "precios_pol", "precios_rnt_no_disponibles", "tipos_bce"]) cache[campo] = {};
    delete cache.bce_cobertura;
  }
  if (caso.cambios) Object.assign(cache, JSON.parse(JSON.stringify(caso.cambios)));
  Object.assign(sb, { __cache: cache, __csv: csv, __con: conClasificacion,
    __config: modo === "con_vault" ? Object.assign({}, configReal) : Object.assign({}, configReal, { vault: "" }) });
  return vm.runInContext(`(async () => {
    log = () => {}; toast = () => {}; renderPanel = () => {}; marcarCacheDirty = () => {}; autoGuardarCache = async () => {};
    const pedido = { bce: null, rnt: [], pol: [] };
    actualizarTiposBce = async (c, fechas) => { pedido.bce = [...fechas].sort(); return 0; };
    precioRntHistorico = async fecha => { pedido.rnt.push(fecha); return null; };
    precioPolHistorico = async fecha => { pedido.pol.push(fecha); return null; };
    state.config = __config;
    state.sync = { silencioso: true };
    const r = cargarCsvRendimientos(__csv);
    state.filasCsv = r.filas;
    state.cache = asegurarEstructuraCache(__cache);
    if (__con) {
      // La clasificación del «Actualizar» de antes (sobre una copia: esta
      // sincronización aún no la ha visto).
      const c = structuredClone(state.cache);
      descubrimientoDinamico(c, r.filas, r.indicePorHash, normalizarDireccion(__config.wallet), normalizarDireccion(__config.vault));
      state.registros = clasificarTransacciones(c, r.filas, r.indicePorHash, __config, {});
    } else state.registros = null;
    await pasoBce();
    await pasoRnt();
    return JSON.parse(JSON.stringify(pedido));
  })()`, sb);
}

(async () => {
  let malos = 0, conAlgo = 0;
  for (const caso of datos.reales) {
    const actualizar = await pedidoDeLaApp(caso, true);
    // Recién abierto: lo mismo salvo POL, que puede faltar pero nunca sobrar.
    const abierto = await pedidoDeLaApp(caso, false);
    const difs = referencia(caso, "salida", { actualizar, abierto });
    const sobran = abierto.pol.filter(f => !actualizar.pol.includes(f));
    if (sobran.length) difs.push("recién abierto: POL que el «Actualizar» no pide " + JSON.stringify(sobran));
    const faltanAlAbrir = actualizar.pol.filter(f => !abierto.pol.includes(f)).length;
    if (actualizar.rnt.length || actualizar.pol.length) conAlgo++;
    console.log("  " + caso.nombre + ": BCE " + (actualizar.bce || []).length + ", RNT " + actualizar.rnt.length + ", POL " + actualizar.pol.length +
      (faltanAlAbrir ? " (recién abierto, " + faltanAlAbrir + " de POL en el siguiente «Actualizar»)" : "") + (difs.length ? " — DISTINTO" : ", iguales"));
    for (const d of difs) console.log("      " + d);
    if (difs.length) malos++;
  }
  if (datos.reales.length < 10) { console.log("FALLO: solo " + datos.reales.length + " escenarios (se esperaban 10)"); process.exit(1); }
  if (conAlgo < 2) { console.log("FALLO: solo " + conAlgo + " escenarios piden fechas de RNT o POL (se esperaban al menos 2)"); process.exit(1); }
  console.log(malos ? "PARIDAD 8.2: " + malos + " de " + datos.reales.length + " escenarios distintos"
    : "PARIDAD 8.2 en verde: la sincronización de la app pide a la red las fechas grabadas (BCE, RNT y POL) en los " + datos.reales.length + " escenarios");
  process.exit(malos ? 1 : 0);
})();
