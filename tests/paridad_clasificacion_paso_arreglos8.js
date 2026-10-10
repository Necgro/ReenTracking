/* PARIDAD de la clasificacion completa: pasa cada escenario de
 * los casos por js/10 y js/14 (archivo de Reental -> descubrimiento ->
 * clasificacion) y compara con las cifras de referencia de la app
 * (tests/cifras_referencia.js) registro a registro SIN tolerancia, y
 * tambien el catalogo y los roles tras el descubrimiento, o el error si se
 * para. Comprueba ademas que la app no escribe en los objetos comunes de
 * JavaScript (una clave «__proto__»).
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_clasificacion_paso_arreglos8.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const { leerCasos, referencia, minimo } = require("./cifras_referencia.js");
const datos = leerCasos("paridad_clasificacion.json");

function app(e) {
  const sb = { console };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js",
                   "10-csv-descubrimiento.js", "14-clasificador.js"]) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  }
  vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sb);  // los casos son en UTC
  sb.__cache = JSON.parse(JSON.stringify(e.cache));
  sb.__config = JSON.parse(JSON.stringify(e.config));
  sb.__csv = e.csv;
  try {
    vm.runInContext(`
      log = () => {}; toast = () => {};
      state.config = __config;
      __csvRes = cargarCsvRendimientos(__csv);
      if (__csvRes.error) throw new Error(__csvRes.error);
      __c = asegurarEstructuraCache(__cache);
      descubrimientoDinamico(__c, __csvRes.filas, __csvRes.indicePorHash,
        normalizarDireccion(__config.wallet), normalizarDireccion(__config.vault));
      __regs = clasificarTransacciones(__c, __csvRes.filas, __csvRes.indicePorHash, __config, {});
    `, sb);
    return {
      ok: true,
      registros: sb.__regs,
      catalogo: sb.__c.catalogo_propiedades,
      aprendidos: sb.__c.contratos_aprendidos,
      // Lo que la app haya escrito en los objetos comunes (una clave
      // «__proto__» o «constructor» en un objeto normal).
      ensuciado: vm.runInContext(
        "[...Object.keys(Object.prototype), ...Object.keys(Object), ...Object.keys(Function.prototype)]", sb),
    };
  } catch (ex) {
    return { ok: false, error: String((ex && ex.message) || ex).slice(0, 300) };
  }
}

minimo(datos, 33, "escenarios");
let fallos = 0;
for (const e of datos) {
  const js = app(e);
  const difs = js.ok && js.ensuciado.length ? ["la app escribio en los objetos comunes: " + js.ensuciado.join(", ")] : [];
  if (js.ok) delete js.ensuciado;
  else difs.push("la app se para: " + js.error);   // nunca vale como referencia
  difs.push(...referencia(e, "salida", js));
  if (difs.length) {
    fallos++;
    console.log("  FALLO " + e.nombre);
    for (const d of difs.slice(0, 12)) console.log("     " + d);
  } else {
    console.log("  ok " + e.nombre + (js.ok ? " (" + js.registros.length + " registros)" : " (se para: " + js.error + ")"));
  }
}
console.log("");
console.log(fallos
  ? `RESULTADO: ${fallos} de ${datos.length} escenarios distintos de lo grabado — HAY FALLOS`
  : `RESULTADO: verde en ${datos.length} escenarios de la clasificación completa, iguales a lo grabado ✔`);
process.exit(fallos ? 1 : 0);
