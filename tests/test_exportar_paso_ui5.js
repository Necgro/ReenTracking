/* Test unitario de 📤 Exportar (js/24): la copia de seguridad.
 *
 * Funciones bajo prueba:
 * - (exArmarCopia se prueba en test_exportar_paso_pm5.js.)
 * - exNombreArchivo: copia-de-seguridad_AAAA-MM-DD.json con la fecha local.
 * - exTextoLleva, exConfigConDatos, exTieneClaves.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_exportar_paso_ui5.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {}, structuredClone };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "24-exportar.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
const { exNombreArchivo, exTextoLleva, exConfigConDatos, exTieneClaves, cacheVacia } = sandbox;

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "11".repeat(20);
const ahora = new Date(2026, 0, 15, 20, 15);   // 15/01/2026 20:15, hora local

assert("nombre del archivo con la fecha y la hora locales (A7; ALMACEN-1: reental_cache_…)", exNombreArchivo(ahora) === "reental_cache_2026-01-15_2015.json", exNombreArchivo(ahora));
assert("nombre a medianoche: el día local", exNombreArchivo(new Date(2026, 0, 1, 0, 5)) === "reental_cache_2026-01-01_0005.json");

assert("qué lleva: las tres partes, números a la española",
  exTextoLleva({ movimientos: 1234, repartos: 40, config: true, claves: false }) ===
  "1.234 transacciones · 40 repartos · tus datos");
assert("qué lleva: con API keys lo dice",
  exTextoLleva({ movimientos: null, repartos: null, config: true, claves: true }) === "tus datos y API keys");
assert("qué lleva: cache vacía cuenta 0", exTextoLleva({ movimientos: 0, repartos: null, config: false }) === "0 transacciones");

assert("config con datos: wallet o vault", exConfigConDatos({ wallet: W }) && exConfigConDatos({ vault: W }) &&
  !exConfigConDatos({ wallet: "  ", vault: "" }) && !exConfigConDatos(null) && !exConfigConDatos({}));
assert("tiene claves: alguna escrita", exTieneClaves({ coingecko_api_key: "x" }) && !exTieneClaves({ etherscan_api_key: " " }) &&
  !exTieneClaves(null));

// Una key que no es texto (config.json escrito a mano) no rompe nada.
assert("A5: una API key que es un número cuenta como escrita y no lanza", exTieneClaves({ coingecko_api_key: 12345 }) === true);
assert("A5: null no cuenta; un 0 escrito sí", exTieneClaves({ coingecko_api_key: null }) === false && exTieneClaves({ etherscan_api_key: 0 }) === true);
assert("A5: una config que no es un objeto no cuenta", exTieneClaves("x") === false && exConfigConDatos(7) === false);

// Una config sin wallet ni vault también se guarda si tiene algo tuyo.
assert("A9: con nombre o NIF cuenta", exConfigConDatos({ inversor: { nombre: "Prueba" } }) &&
  exConfigConDatos({ wallet: "", inversor: { nif: "00000000T" } }));
assert("A9: solo API keys cuenta si van en la copia", exConfigConDatos({ etherscan_api_key: "K" }, true) &&
  !exConfigConDatos({ etherscan_api_key: "K" }, false));
assert("A9: inversor vacío o raro no cuenta", !exConfigConDatos({ inversor: { nombre: " ", nif: "" } }) &&
  !exConfigConDatos({ inversor: "x" }) && !exConfigConDatos({ inversor: null }));

// Singular con 1.
assert("A10: «1 transacción» y «1 reparto»", exTextoLleva({ movimientos: 1, repartos: 1, config: false }) ===
  "1 transacción · 1 reparto");

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
