/* PARIDAD del descuadre (el archivo de Reental y la blockchain no cuadran).
 *
 * Lee los escenarios de los casos (base, archivo viejo y cache vieja, con
 * los datos del usuario descuadrados en memoria), pasa cada uno por la
 * clasificacion de la app (js/01, 02, 05, 10 y 14 en una VM de Node, como
 * ejecutarClasificacion sin DOM) y compara con las cifras de referencia de
 * la app (tests/cifras_referencia.js) registro a registro, campo a campo,
 * y los avisos que cuenta arrDescuadres (js/19); comprueba además que el
 * resumen de la Puesta en marcha enseña la línea de cada uno con su remedio.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_cuadre_paso_cuadre1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const { leerCasos, referencia, minimo } = require("./cifras_referencia.js");
const datos = leerCasos("paridad_cuadre1.json");

function contexto(archivos) {
  const sb = { console, log: () => {}, toast: () => {}, state: {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sb);  // los casos son en UTC
  vm.runInContext("log = () => {}; toast = () => {};", sb);
  return sb;
}

function ejecutarApp(cacheRaw, csvTexto) {
  const sb = contexto(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"]);
  Object.assign(sb, { __cache: structuredClone(cacheRaw), __config: structuredClone(datos.config), __csv: csvTexto });
  vm.runInContext(`
    state.config = __config;
    __csvRes = cargarCsvRendimientos(__csv);
    __c = asegurarEstructuraCache(__cache);
    descubrimientoDinamico(__c, __csvRes.filas, __csvRes.indicePorHash,
      normalizarDireccion(__config.wallet), normalizarDireccion(__config.vault));
    __regs = clasificarTransacciones(__c, __csvRes.filas, __csvRes.indicePorHash, __config, {});
  `, sb);
  return sb.__regs;
}

minimo(datos.escenarios, 3, "escenarios");
let fallos = 0;
function comprobar(nombre, cond, extra) {
  console.log((cond ? "  OK   " : "  FALLO ") + nombre + (!cond && extra ? " -> " + extra : ""));
  if (!cond) fallos++;
}

const arranque = contexto(["01-constantes.js", "02-utilidades.js", "04-config.js", "14-clasificador.js", "19-arranque.js"]);
for (const e of datos.escenarios) {
  console.log(`=== ${e.nombre} ===`);
  const regs = ejecutarApp(e.cache, e.csv_texto);
  const dc = arranque.arrDescuadres(regs);
  const diffs = referencia(e, "salida", { registros: regs, avisos: [dc.csvMasNuevo, dc.sinArchivo] });
  comprobar(`igual a lo grabado registro a registro (${regs.length} registros, ${regs.filter(r => r.revisar).length} a revisar)` +
    ` y en los avisos: ${dc.csvMasNuevo} del archivo sin descargar, ${dc.sinArchivo} sin archivo`, diffs.length === 0, diffs.slice(0, 5).join(" | "));
  const lineas = arranque.arrResumen({ clasificacion: { registros: regs.length, revisar: 0, inmuebles: 1 },
    vaultConfigurado: true, descuadres: dc }).lineas.filter(l => /archivo de Reental/.test(l.texto));
  for (const l of lineas) console.log("    ⚠ " + l.texto.replace(/<\/?b>/g, "") + " [" + l.accion.texto + "]");
  if (e.nombre === "base") comprobar("ninguna línea de aviso", lineas.length === 0);
  if (e.nombre === "archivo_viejo") {
    // Sin «paso 3»; la acción lleva a la zona del archivo de Reental.
    comprobar("una línea: cargar un archivo más nuevo", lineas.length === 1 &&
      /no están en el archivo de Reental\. Carga uno más nuevo\./.test(lineas[0].texto) && lineas[0].accion.ir === "dzCsv");
  }
  if (e.nombre === "cache_vieja") {
    comprobar("una línea: pulsar «🔄 Actualizar», con enlace a Revisión", lineas.length === 1 &&
      /aún no están descargados\. Pulsa «🔄 Actualizar»\./.test(lineas[0].texto) && lineas[0].accion.fn === "revision");
  }
}

console.log(fallos ? `\nRESULTADO: ${fallos} fallo(s) ✘` : "\nRESULTADO: verde con el archivo y la cache descuadrados, igual a lo grabado ✔");
process.exit(fallos ? 1 : 0);
