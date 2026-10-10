/* Test de más arreglos del motor fiscal en la app. Una sección por fallo
 * arreglado que toca js/.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_arreglos_paso_arreglos3.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
function nuevoSandbox(archivos, extra = {}) {
  const sb = Object.assign({ console, state: {} }, extra);
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext("log = function () {}; toast = function () {};", sb);
  return sb;
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

function main() {
  console.log("== A21. Un importe escrito como texto no se enseña como bueno ==");
  {
    const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "08-coingecko.js", "14-clasificador.js",
      "15-correcciones.js", "18-transacciones.js"]);
    const base = { categoria: "RENDIMIENTO", subcategoria: "RCM_RECLAMADO", importe_usdt: 81 };
    const texto = S.txLineasImporte(Object.assign({ integro_usdt: 100, retencion_usdt: "19" }, base));
    assert("retención «19» (texto): 0", texto[1] === "Retención: 0 USD", texto);
    const verdadero = S.txLineasImporte(Object.assign({ integro_usdt: 100, retencion_usdt: true }, base));
    assert("retención true: 0, no 1", verdadero[1] === "Retención: 0 USD", verdadero);
    assert("sin «(ret. 19)» corto", S.txRetencionCorta(Object.assign({ integro_usdt: 100, retencion_usdt: "19" }, base)) === "");
    const integro = S.txLineasImporte(Object.assign({ integro_usdt: "100", retencion_usdt: 19 }, base));
    assert("íntegro «100» (texto): se enseña lo que llegó", integro.length === 1 && integro[0].startsWith("81"), integro);
    const bueno = S.txLineasImporte(Object.assign({ integro_usdt: 100, retencion_usdt: 19 }, base));
    assert("con números de verdad, igual que antes", bueno[1] === "Retención: 19 USD" && bueno[2] === "Neto: 81 USD", bueno);
  }

  console.log("== A25. Swap de USDT por RNT contra el pool con resto devuelto ==");
  {
    const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
      "14-clasificador.js"]);
    const WALLET = "0x" + "e1".repeat(20), VAULT = "0x" + "e2".repeat(20);
    const SLP = "0x" + "5b".repeat(20), PAR = "0x" + "5c".repeat(20);
    const USDT = vm.runInContext("USDT", S), RNT = vm.runInContext("RNT", S);
    const ts = String(Math.floor(Date.parse("2025-04-16T09:00:00Z") / 1000));
    const h = "0x" + Buffer.from("sw").toString("hex");
    const tx = (contrato, de, a, valor, dec) => ({ hash: h, contractAddress: contrato, from: de, to: a,
      value: valor, tokenDecimal: String(dec), tokenName: "X", tokenSymbol: "X", timeStamp: ts });
    const cache = S.cacheVacia();
    cache.transacciones.wallet_tokens = [
      tx(USDT, PAR, WALLET, "14733", 6), tx(USDT, WALLET, PAR, "6248310", 6),   // el resto, primero
      tx(RNT, PAR, WALLET, "20000000000000000000", 18)];
    cache.contratos_aprendidos = { DEFI_POOL: { [SLP]: {}, [PAR]: {} } };
    Object.assign(S, { __cache: cache, __config: { wallet: WALLET, vault: VAULT,
      compra_bancaria_coste_eur_por_token: 100.0 } });
    vm.runInContext(`state.config = __config; __r = cargarCsvRendimientos("id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date\\n");
      __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});`, S);
    const filas = S.__regs.map(r => [r.categoria, r.contrato, r.cantidad,
      r.importe_usdt === undefined ? null : r.importe_usdt]).sort();
    const esperado = [["COMPRA", RNT, 20, 6.233577], ["MOVIMIENTO", USDT, 0.014733, null],
      ["VENTA", USDT, 6.233577, 6.233577]].sort();
    assert("venta del USDT neto, compra del RNT y el resto aparte",
      JSON.stringify(filas) === JSON.stringify(esperado), filas);
    const resto = S.__regs.find(r => r.categoria === "MOVIMIENTO");
    assert("el resto con su nota", resto && resto.nota === vm.runInContext("NOTA_RESTO_DEVUELTO", S),
      resto && resto.nota);
  }

  console.log("\n" + ok + " OK, " + fallos + " fallos");
  if (fallos) process.exit(1);
}
main();
