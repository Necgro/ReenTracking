/* PARIDAD del informe para la Renta de la app · con los datos del
 * usuario: la cadena entera de la app.
 *
 * Por cada escenario de los casos (6, con su «hoy»):
 * clasificar (como ejecutarClasificacion de js/14, sin pantalla ni red),
 * el motor sobre una copia (js/21) y el informe (js/22), y compara los
 * informes campo a campo con las cifras de referencia de la app, sin
 * tolerancia. Comprueba ademas que ni el motor ni el informe cambian la
 * cache.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_informe_renta_real_paso_52f.js
 *
 * DATOS: lee reental_cache.json, config.json y el archivo de rendimientos
 * de privado/datos_reales/ solo en memoria.
 */
"use strict";
const { leerCasos, referencia } = require("./cifras_referencia.js");
const { cadenaEntera } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_INFORME } = require("./paridad_informe_renta_paso_52f.js");

const datos = leerCasos("paridad_informe_renta_real_52f.json");
cadenaEntera(datos.reales, MODULOS_INFORME, "5.2", (sb, caso) => {
  const cacheAntes = JSON.stringify(sb.__c);
  // Como dice la cabecera de js/22.
  const regs = structuredClone(sb.__regs);
  const op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
  sb.motorFiscal(regs, sb.__c, sb.__config, op);
  const informes = sb.informesRentaAnuales(regs, sb.resumenFiscalAnual(regs), sb.__config,
    Object.assign({}, op, { cache: sb.__c, hoy: caso.hoy, descarga_incompleta: false }));
  const difs = referencia(caso, "salida", informes);
  if (JSON.stringify(sb.__c) !== cacheAntes) difs.push("el motor o el informe cambiaron la cache");
  const avisos = Object.values(informes).reduce((n, i) => n + i.avisos.length, 0);
  console.log("  " + caso.nombre + ": informes de " + Object.keys(informes).join(", ") + "; " + avisos + " avisos");
  return difs;
}, "clasificar, calcular y el informe dan lo grabado");
