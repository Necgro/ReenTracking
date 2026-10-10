/* PARIDAD del informe para la Renta imprimible de la app · con los datos
 * del usuario: la cadena entera de la app.
 *
 * Por cada escenario de los casos (6, con su «hoy»):
 * clasificar (como ejecutarClasificacion de js/14, sin pantalla ni red),
 * el motor sobre una copia (js/21), los informes (js/22) y el informe
 * imprimible de cada año (pdfHtml, js/27), y compara lo que se lee en él
 * (piezasApp de paridad_informe_pdf_paso_63.js) con las cifras de
 * referencia de la app. Comprueba ademas que la cadena no cambia la cache.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_informe_pdf_real_paso_63.js
 *
 * DATOS: lee reental_cache.json, config.json y el archivo de rendimientos
 * de privado/datos_reales/ solo en memoria.
 */
"use strict";
const { leerCasos, referencia } = require("./cifras_referencia.js");
const { cadenaEntera } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_PDF, piezasApp } = require("./paridad_informe_pdf_paso_63.js");

const datos = leerCasos("paridad_informe_pdf_real_63.json");
cadenaEntera(datos.reales, MODULOS_PDF, "6.3", (sb, caso) => {
  const cacheAntes = JSON.stringify(sb.__c);
  const regs = structuredClone(sb.__regs);
  const op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
  sb.motorFiscal(regs, sb.__c, sb.__config, op);
  const informes = sb.informesRentaAnuales(regs, sb.resumenFiscalAnual(regs), sb.__config,
    Object.assign({}, op, { cache: sb.__c, hoy: caso.hoy, descarga_incompleta: false }));
  const anios = {};
  for (const anio of Object.keys(informes).sort()) anios[anio] = piezasApp(sb, informes[anio], new Date(caso.hoy + "T12:00:00Z"));
  const difs = referencia(caso, "salida", anios);
  if (JSON.stringify(sb.__c) !== cacheAntes) difs.push("la cadena cambio la cache");
  const tablas = Object.values(anios).reduce((n, a) => n + a.tablas.length, 0);
  console.log("  " + caso.nombre + ": " + Object.keys(anios).length + " informes, " + tablas + " tablas");
  return difs;
}, "clasificar, calcular, el informe y el informe imprimible dan lo grabado");
