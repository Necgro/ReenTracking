/* PARIDAD de la carga de tu archivo.
 *
 * Lee los casos (el JSON de cada archivo de prueba, y el tuyo) y los abre como la app: primero arrTipoArchivo
 * (js/19: ¿es tu archivo, o está mal escrito?) y, si lo acepta,
 * asegurarEstructuraCache (js/05). Compara la cache entera con las cifras
 * de referencia de la app (tests/cifras_referencia.js), sin tolerancia.
 *
 * La app rechaza a propósito lo que no
 * sabe arreglar: un archivo sin «transacciones» (caches a medias) o con un
 * bloque que no es un objeto y no se aparta solo (tipos_bce: null…). Esos
 * se cuentan aparte; lo que la app aparta al abrir (precios de POL y pagos
 * diferidos mal escritos) tiene que abrirse.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/paridad_carga_cache_paso_fase84.js
 */
"use strict";
const { leerCasos, minimo } = require("./cifras_referencia.js");
const { compararCasos, sandbox } = require("./paridad_motor_fiscal_paso_51f.js");

const datos = leerCasos("paridad_carga_84.json");
const sb = sandbox(["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "08-coingecko.js",
  "10-csv-descubrimiento.js", "14-clasificador.js", "19-arranque.js"]);

const reales = datos.reales || [];
const todos = datos.sinteticos.concat(reales);
const abre = caso => ["cache", "copia"].includes(sb.arrTipoArchivo(JSON.parse(JSON.stringify(caso.entrada ?? null))));
const casos = todos.filter(abre);
console.log("La app abre " + casos.length + " de " + todos.length + " (las demás, a medias o con un bloque que no sabe arreglar: las rechaza a propósito)" +
  (reales.length ? "; con tu archivo de privado/datos_reales/." : "; sin tu archivo en privado/datos_reales/."));
if (reales.length && !reales.every(abre)) { console.log("FALLO: la app no abre tu archivo"); process.exit(1); }
// Los que rechaza a propósito son 8: uno
// más rechazado sería un archivo bueno que ya no abre.
if (todos.length - casos.length !== 8) {
  console.log("FALLO: la app rechaza " + (todos.length - casos.length) + " archivos (se esperaban 8)");
  process.exit(1);
}
// Un archivo entero con los precios de POL mal escritos se abre (y se
// apartan). Los casos traen al menos 3.
const polMal = todos.filter(c => c.entrada && typeof c.entrada.transacciones === "object" && c.entrada.precios_pol !== undefined &&
  (c.entrada.precios_pol === null || typeof c.entrada.precios_pol !== "object" || Array.isArray(c.entrada.precios_pol)));
if (polMal.length < 3 || !polMal.every(abre)) {
  console.log("FALLO: archivos con los precios de POL mal escritos: " + polMal.filter(abre).length + " de " + polMal.length + " se abren (se esperaban al menos 3, todos)");
  process.exit(1);
}
minimo(todos, 25, "archivos de los casos");
compararCasos(casos, "cargas", 17, {
  paso: "8.4",
  ejecutar: caso => {
    const entrada = JSON.parse(JSON.stringify(caso.entrada));
    return { salida: JSON.parse(JSON.stringify(sb.asegurarEstructuraCache(entrada))) };
  },
  porArchivo: { "tests/test_precios_pol_paso_pol1.py": 7 },
});
