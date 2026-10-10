/* PARIDAD del motor fiscal de la app · casos de los tests.
 *
 * Lee los casos (cada llamada distinta grabada a motor_fiscal), pasa la entrada por motorFiscal (js/21, en
 * una VM de Node con los modulos que usa) y compara con las cifras de
 * referencia de la app (tests/cifras_referencia.js), sin tolerancia: cada
 * registro campo a campo, las colas FIFO, la cartera a 31/12 (cierres), lo
 * apartado y el resumen anual.
 * Los 6 escenarios con los datos del usuario van aparte
 * (paridad_motor_fiscal_real_paso_51f). Las ayudas de aqui (sandbox,
 * compararCasos, cadenaEntera...) las usan tambien las demas paridades.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_motor_fiscal_paso_51f.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const { leerCasos, referencia } = require("./cifras_referencia.js");

const MODULOS_MOTOR = ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js",
  "10-csv-descubrimiento.js", "14-clasificador.js", "21-fiscal.js"];

/* Una VM de Node con esos modulos de la app, sin pantalla. zona: la de las
   fechas; por defecto UTC, la de los casos (paridades).
   Los tests de la app piden HORA_APP (con UTC probarian un camino que la
   app no usa). */
const HORA_APP = { zona: "Europe/Madrid" };
function sandbox(modulos, { zona = "UTC" } = {}) {
  const sb = { console, TextEncoder, log: () => {}, toast: () => {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of modulos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext("log = () => {}; toast = () => {};", sb);
  vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = ' + JSON.stringify(zona) + ";", sb);
  return sb;
}
// Solo se monta si se usa (quien solo toma las ayudas no la necesita).
let sbMotor = null;

/* Lo que devuelve la app, sin Map (Map -> objeto). Los Map vienen de la
   VM: instanceof Map no los reconoce. */
function plano(x) {
  if (Object.prototype.toString.call(x) === "[object Map]") return Object.fromEntries([...x].map(([k, v]) => [String(k), plano(v)]));
  if (Array.isArray(x)) return x.map(plano);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plano(v)]));
  return x;
}

function ejecutarCaso(caso) {
  const e = caso.entrada;
  const sb = sbMotor || (sbMotor = sandbox(MODULOS_MOTOR));
  sb.__e = e;
  vm.runInContext("state.config = { wallet: __e.wallet, vault: __e.vault };", sb);
  const opciones = {};
  for (const k of e.opciones) opciones[k] = {};
  const registros = e.registros;   // cada caso se pasa una vez: sin copias
  const colas = sb.motorFiscal(registros, e.cache, e.config, opciones);
  return { salida: { registros, colas, ...opciones, resumen: sb.resumenFiscalAnual(registros) } };
}

const errorDeLaApp = err =>
  "error en la app: " + (err && err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : err);

/* Compara un grupo de casos con lo grabado y termina el proceso con su
   resultado. minimo: cuantos casos tiene que haber como poco (si no, algo
   dejo de grabarse y el verde no valdria). porArchivo: {archivo de tests:
   minimo}, para que no se pierdan los casos de un archivo sin que se vea
   (con solo el total, se podrian perder archivos enteros).
   ejecutar(caso) da { salida, cambio } (cambio: lo que la app cambio de lo
   que recibe, si lo hizo); paso: el de la etiqueta. */
function compararCasos(casos, grupo, minimo, { ejecutar = ejecutarCaso, paso = "5.1", porArchivo = {} } = {}) {
  let malos = 0;
  for (const caso of casos) {
    let difs;
    try {
      const r = ejecutar(caso);
      difs = referencia(caso, "salida", r.salida);
      if (r.cambio) difs.push(r.cambio);
    } catch (err) {
      difs = [errorDeLaApp(err)];
    }
    if (difs.length) {
      malos++;
      if (malos <= 8) {
        console.log("FALLO " + grupo + " · " + caso.nombre + " (" + difs.length + " diferencias)");
        for (const d of difs.slice(0, 6)) console.log("    " + d);
      }
    }
  }
  console.log(grupo + ": " + (casos.length - malos) + "/" + casos.length + " iguales");
  if (casos.length < minimo) {
    console.log("FALLO " + grupo + ": solo " + casos.length + " casos (se esperaban al menos " + minimo + ")");
    process.exit(1);
  }
  const deArchivo = {};
  for (const caso of casos) {
    const archivo = caso.nombre.split("::")[0];
    deArchivo[archivo] = (deArchivo[archivo] || 0) + 1;
  }
  const cortos = Object.entries(porArchivo).filter(([a, n]) => (deArchivo[a] || 0) < n);
  for (const [a, n] of cortos) {
    console.log("FALLO " + grupo + ": " + a + " da " + (deArchivo[a] || 0) + " casos (se esperaban al menos " + n + ")");
  }
  if (cortos.length) process.exit(1);
  if (malos) {
    console.log("PARIDAD " + paso + " (" + grupo + "): " + malos + " de " + casos.length + " casos distintos");
    process.exit(1);
  }
  console.log("PARIDAD " + paso + " (" + grupo + ") en verde: " + casos.length + " casos iguales a las cifras de referencia");
}

/* La cadena entera de la app con los datos del usuario (los 6 escenarios
   modo/vinculos): clasificar en una VM con esos modulos, como
   ejecutarClasificacion (js/14), sin pantalla ni red, y comprobar(sb, caso)
   lo que siga (da la lista de diferencias, con referencia()). Termina el proceso con su
   resultado; verde: lo que dice la linea en verde. Los datos privados de
   la raiz solo se leen, en memoria. */
function cadenaEntera(casos, modulos, paso, comprobar, verde) {
  const RAIZ = path.join(__dirname, "..");
  const leer = f => fs.readFileSync(path.join(RAIZ, "privado", "datos_reales", f), "utf8");
  const cacheReal = leer("reental_cache.json");
  const configReal = JSON.parse(leer("config.json"));
  const csv = leer(fs.existsSync(path.join(RAIZ, "privado", "datos_reales", "reental_rendimientos.csv"))
    ? "reental_rendimientos.csv" : "reental_dividendos.csv");
  let malos = 0;
  for (const caso of casos) {
    const [modo, vinculos] = caso.nombre.split("/");
    const sb = sandbox(modulos);
    const cache = JSON.parse(cacheReal);
    if (modo === "sin_vault_ni_series") {
      cache.transacciones.vault_normales = [];
      cache.transacciones.vault_tokens = [];
    }
    if (vinculos === "sin_vinculos") cache.pagos_diferidos = { version: 1, ventas: [] };
    sb.__cache = cache;
    sb.__csv = csv;
    sb.__config = modo === "con_vault" ? Object.assign({}, configReal) : Object.assign({}, configReal, { vault: "" });
    vm.runInContext(`
      state.config = __config;
      __r = cargarCsvRendimientos(__csv);
      __c = asegurarEstructuraCache(__cache);
      descubrimientoDinamico(__c, __r.filas, __r.indicePorHash,
        normalizarDireccion(__config.wallet), normalizarDireccion(__config.vault));
      __regs = clasificarTransacciones(__c, __r.filas, __r.indicePorHash, __config, {});
    `, sb);
    let difs;
    try {
      difs = comprobar(sb, caso);
    } catch (err) {
      difs = [errorDeLaApp(err)];
    }
    if (difs.length) {
      malos++;
      console.log("FALLO cadena entera · " + caso.nombre + " (" + difs.length + " diferencias)");
      for (const d of difs.slice(0, 6)) console.log("    " + d.replace(/: antes .*/, ""));
    }
  }
  if (casos.length < 6) {
    console.log("FALLO: solo " + casos.length + " escenarios (se esperaban 6)");
    process.exit(1);
  }
  if (malos) {
    console.log("PARIDAD " + paso + " (cadena entera de la app): " + malos + " de " + casos.length +
      " escenarios distintos");
    process.exit(1);
  }
  console.log("PARIDAD " + paso + " (cadena entera de la app) en verde: " + verde + " en los " +
    casos.length + " escenarios");
}

module.exports = { compararCasos, cadenaEntera, plano, sandbox, HORA_APP, MODULOS_MOTOR };

if (require.main === module) {
  const datos = leerCasos("paridad_motor_fiscal_51f.json");
  // 405 con tus datos en privado/datos_reales/ y 403 sin ellos. Y lo de
  // cada archivo de origen (un caso con la misma entrada que otro de un
  // archivo posterior cuenta en el primero: el minimo del segundo baja).
  compararCasos(datos.sinteticos, "casos de los tests", 403, { porArchivo: {
    "tests/test_apartar_paso_apartar2.py": 6, "tests/test_archivo_datos_paso_rend3c.py": 1,
    "tests/test_arreglos_paso_arreglos2.py": 34, "tests/test_arreglos_paso_arreglos3.py": 145,
    "tests/test_arreglos_paso_arreglos4.py": 38, "tests/test_arreglos_paso_arreglos5.py": 24,
    "tests/test_arreglos_paso_arreglos6.py": 3, "tests/test_arreglos_paso_arreglos7.py": 14,
    "tests/test_cuadre_paso_cuadre1.py": 6, "tests/test_cuadre_paso_cuadre2.py": 20,
    "tests/test_decisiones_paso_45.py": 3, "tests/test_informe_renta_paso_52f.py": 6,
    "tests/test_informe_renta_paso_div15d3.py": 4, "tests/test_informes_paso_div15c.py": 1,
    "tests/test_lotes_venta_paso_div15d2.py": 10, "tests/test_matriz_paso_52.py": 3,
    "tests/test_motor_fiscal_paso_51f.py": 23, "tests/test_pagos_diferidos_paso_14.py": 6,
    "tests/test_precios_pol_paso_pol1.py": 4, "tests/test_reglas_paso_reglas1.py": 9,
    "tests/test_rendimientos_paso_div14.py": 10, "tests/test_rendimientos_paso_div14b.py": 11,
    "tests/test_rendimientos_paso_div15.py": 10, "tests/test_rendimientos_paso_div15b.py": 11,
    "tests/test_sin_vault_paso_div12.py": 1 } });
}
