/* PARIDAD del informe para la Renta de la app · casos de los tests.
 *
 * Lee los casos (cada llamada distinta grabada a informes_renta_anuales, y
 * las sueltas a informe_renta_anio), pasa la entrada por informesRentaAnuales
 * o informeRentaAnio (js/22, en una VM de Node con los modulos que usa) y
 * compara campo a campo con las cifras de referencia de la app, sin
 * tolerancia (las ayudas de paridad_motor_fiscal_paso_51f.js). Comprueba ademas que el informe no
 * cambia lo que recibe. Los 6 escenarios con los datos del usuario van
 * aparte (paridad_informe_renta_real_paso_52f).
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_informe_renta_paso_52f.js
 */
"use strict";
const vm = require("vm");
const { leerCasos } = require("./cifras_referencia.js");
const { compararCasos, sandbox } = require("./paridad_motor_fiscal_paso_51f.js");

const MODULOS_INFORME = ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js",
  "09-sincronizacion.js", "10-csv-descubrimiento.js", "14-clasificador.js", "21-fiscal.js",
  "22-informe-renta.js"];
let sbInforme = null;   // solo se monta si se usa

/* Lo que devuelve la app para la entrada grabada. */
function ejecutarCaso(caso) {
  const e = caso.entrada, a = e.args;
  const sb = sbInforme || (sbInforme = sandbox(MODULOS_INFORME));
  sb.__e = e;
  vm.runInContext("state.config = { wallet: __e.wallet, vault: __e.vault };", sb);
  const antes = JSON.stringify(a);
  let salida;
  if (e.funcion === "informesRentaAnuales") {
    salida = sb.informesRentaAnuales(a.registros, a.resumen, a.config, {
      cierres: a.cierres, cache: a.cache, cierres_usd: a.cierres_usd,
      cierres_pools: a.cierres_pools, hoy: a.hoy,
      descarga_incompleta: a.descarga_incompleta, cierres_otras: a.cierres_otras });
  } else {
    salida = sb.informeRentaAnio(a.anio, a.registros_anio, a.bloque_resumen, a.config, {
      cierre: a.cierre, datos_hasta: a.datos_hasta, cierre_anterior: a.cierre_anterior,
      nombres: a.nombres, cache: a.cache, cierre_usd: a.cierre_usd, en_pools: a.en_pools,
      nombres_tokens: a.nombres_tokens, hoy: a.hoy, en_otras: a.en_otras });
  }
  return { salida,
    cambio: JSON.stringify(a) !== antes ? "el informe cambio lo que recibe" : null };
}

module.exports = { MODULOS_INFORME };

if (require.main === module) {
  const datos = leerCasos("paridad_informe_renta_52f.json");
  // 115 con tus datos en privado/datos_reales/ y 113 sin ellos. Y lo de
  // cada archivo de origen (la nota de paridad_motor_fiscal_paso_51f.js
  // vale aqui).
  compararCasos(datos.sinteticos, "casos de los tests", 113, { ejecutar: ejecutarCaso, paso: "5.2", porArchivo: {
    "tests/test_archivo_datos_paso_rend3c.py": 1, "tests/test_arreglos_paso_arreglos2.py": 5,
    "tests/test_arreglos_paso_arreglos3.py": 4, "tests/test_arreglos_paso_arreglos4.py": 41,
    "tests/test_arreglos_paso_arreglos5.py": 29, "tests/test_cuadre_paso_cuadre2.py": 3,
    "tests/test_informe_excel_paso_div15e.py": 1, "tests/test_informe_renta_paso_52f.py": 14,
    "tests/test_informe_renta_paso_div15d3.py": 8, "tests/test_informes_paso_div15c.py": 1,
    "tests/test_lotes_venta_paso_div15d2.py": 1, "tests/test_precios_pol_paso_pol1.py": 4,
    "tests/test_sin_vault_paso_div12.py": 1 } });
}
