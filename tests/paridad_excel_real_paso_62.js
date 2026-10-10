/* PARIDAD del Excel de la app · con los datos del
 * usuario: la cadena entera de la app.
 *
 * Por cada escenario de los casos (6, con su «hoy»):
 * clasificar (como ejecutarClasificacion de js/14, sin pantalla ni red),
 * el motor sobre una copia (js/21), los informes (js/22) y el Excel
 * (js/26), lo lee con openpyxl y lo compara celda a celda con las cifras
 * de referencia de la app. Comprueba ademas que la cadena no cambia la
 * cache.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_excel_real_paso_62.js
 *
 * DATOS: lee reental_cache.json, config.json y el archivo de rendimientos
 * de privado/datos_reales/ solo en memoria; el Excel de cada escenario va a una carpeta
 * temporal que se borra al terminar.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { leerCasos, referencia } = require("./cifras_referencia.js");
const { cadenaEntera } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_EXCEL, volcarConPython, guardarExcel, generado } = require("./paridad_excel_paso_62.js");

const datos = leerCasos("paridad_excel_real_62.json");
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "excel62r-"));
process.on("exit", () => fs.rmSync(carpeta, { recursive: true, force: true }));
cadenaEntera(datos.reales, MODULOS_EXCEL, "6.2", (sb, caso) => {
  const cacheAntes = JSON.stringify(sb.__c);
  // Como dice la cabecera de js/26.
  const regs = structuredClone(sb.__regs);
  const op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
  const colas = sb.motorFiscal(regs, sb.__c, sb.__config, op);
  const resumen = sb.resumenFiscalAnual(regs);
  const informes = sb.informesRentaAnuales(regs, resumen, sb.__config,
    Object.assign({}, op, { cache: sb.__c, hoy: caso.hoy, descarga_incompleta: false }));
  const ruta = path.join(carpeta, caso.nombre.replace(/\W/g, "_") + ".xlsx");
  const cambio = guardarExcel(sb, { registros: regs, colas, resumen, cache: sb.__c, config: sb.__config, informes }, ruta,
    generado(caso));
  const [volcado] = volcarConPython([ruta]);
  const difs = referencia(caso, "salida", volcado);
  if (cambio) difs.push(cambio);
  if (JSON.stringify(sb.__c) !== cacheAntes) difs.push("la cadena cambio la cache");
  const celdas = Object.values(volcado.hojas).reduce((n, h) => n + Object.keys(h).length, 0);
  console.log("  " + caso.nombre + ": " + volcado.orden.length + " hojas, " + celdas + " celdas");
  return difs;
}, "clasificar, calcular, el informe y el Excel dan lo grabado");
