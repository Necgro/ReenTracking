/* PARIDAD del motor fiscal de la app · con los datos del usuario.
 *
 * Lee los casos (6 escenarios: registros ya clasificados, como entrada del
 * motor) y los compara como la
 * paridad de los casos de los tests (paridad_motor_fiscal_paso_51f.js, de
 * la que usa compararCasos): sin tolerancia, registro a registro y campo a
 * campo, con las cifras de referencia de la app.
 *
 * Despues, la cadena entera: clasificar con
 * la app los mismos datos y pasar lo clasificado por el motor de la app,
 * comparado con lo grabado (en el mismo orden). Tambien, que el motor deja
 * la cache como estaba.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_motor_fiscal_real_paso_51f.js
 *
 * DATOS: los privados de privado/datos_reales/ solo se leen, en memoria.
 */
"use strict";
const { leerCasos, referencia } = require("./cifras_referencia.js");
const { compararCasos, cadenaEntera, MODULOS_MOTOR } = require("./paridad_motor_fiscal_paso_51f.js");

const datos = leerCasos("paridad_motor_fiscal_real_51f.json");
compararCasos(datos.reales, "escenarios reales", 6);

cadenaEntera(datos.reales, MODULOS_MOTOR, "5.1", (sb, caso) => {
  const registros = structuredClone(sb.__regs);
  const cacheAntes = JSON.stringify(sb.__c);
  const opciones = { cierres: {}, cierres_usd: {}, cierres_pools: {}, apartado: {}, cierres_otras: {} };
  const colas = sb.motorFiscal(registros, sb.__c, sb.__config, opciones);
  const difs = referencia(caso, "cadena", { registros, colas, ...opciones, resumen: sb.resumenFiscalAnual(registros) });
  if (JSON.stringify(sb.__c) !== cacheAntes) difs.push("el motor cambio la cache");
  return difs;
}, "clasificar y calcular en la app da lo grabado");
