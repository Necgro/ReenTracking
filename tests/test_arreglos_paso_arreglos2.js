/* Test de arreglos del motor fiscal en la app. Una sección por fallo
 * arreglado que toca js/.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_arreglos_paso_arreglos2.js
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

async function main() {
  console.log("== A14. Un día que el BCE aún no ha publicado no se da por descargado ==");
  {
    // El BCE responde sin el día de hoy (07/01): aún no lo ha publicado.
    let llamadas = 0;
    const respuesta = { structure: { dimensions: { observation: [{ values: [{ id: "2025-01-03" }, { id: "2025-01-06" }] }] } },
      dataSets: [{ series: { "0": { observations: { "0": [1.04], "1": [1.05] } } } }] };
    const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "07-bce.js"],
      { fetch: async () => { llamadas++; return { ok: true, text: async () => JSON.stringify(respuesta) }; }, URLSearchParams });
    const cache = { tipos_bce: {}, bce_cobertura: {} };
    await S.actualizarTiposBce(cache, ["2025-01-07"], "2025-01-07");
    assert("la cobertura llega hasta ayer, no hasta hoy", cache.bce_cobertura.fin === "2025-01-06", cache.bce_cobertura);
    await S.actualizarTiposBce(cache, ["2025-01-07"], "2025-01-08");
    assert("al día siguiente vuelve a pedirlo", llamadas === 2, llamadas);
    assert("y entonces sí queda cubierto", cache.bce_cobertura.fin === "2025-01-07", cache.bce_cobertura);
    await S.actualizarTiposBce(cache, ["2025-01-07"], "2025-01-09");
    assert("lo ya cubierto no se vuelve a pedir", llamadas === 2, llamadas);
  }

  console.log("== A17. «Neto» es íntegro menos retención (no lo que llegó) ==");
  {
    const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "08-coingecko.js", "14-clasificador.js",
      "15-correcciones.js", "18-transacciones.js"]);
    const base = { categoria: "RENDIMIENTO", subcategoria: "RCM_RECLAMADO", integro_usdt: 100, retencion_usdt: 9.5 };
    const parcial = S.txLineasImporte(Object.assign({ importe_usdt: 40.5 }, base));
    assert("reclamo parcial con parte pendiente: neto 90,5", parcial[2] === "Neto: 90,5 USD", parcial);
    const pend = S.txLineasImporte({ categoria: "RENDIMIENTO", subcategoria: "RCM_PENDIENTE", integro_usdt: 100,
      retencion_usdt: 0, importe_usdt: 0 });
    assert("pendiente: neto 100, no 0", pend[2] === "Neto: 100 USD", pend);
  }

  console.log("== A13. Enviar stablecoin o POL a una dirección desconocida queda a revisar ==");
  {
    const S = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
      "14-clasificador.js"]);
    const WALLET = "0x" + "e1".repeat(20), VAULT = "0x" + "e2".repeat(20), FUERA = "0x" + "b6".repeat(20);
    const USDT = vm.runInContext("USDT", S);
    const cache = S.cacheVacia();
    cache.transacciones.wallet_tokens = [{ hash: "0x" + "71".repeat(32), contractAddress: USDT, from: WALLET,
      to: FUERA, value: "50000000", tokenDecimal: "6", tokenName: "USDT0", tokenSymbol: "USDT0",
      timeStamp: "1741000000" }];
    cache.transacciones.wallet_normales = [{ hash: "0x" + "70".repeat(32), from: WALLET, to: FUERA,
      value: "5000000000000000000", timeStamp: "1741000000", gasUsed: "21000", gasPrice: "1", isError: "0" }];
    Object.assign(S, { __cache: cache, __config: { wallet: WALLET, vault: VAULT,
      compra_bancaria_coste_eur_por_token: 100.0 } });
    vm.runInContext(`state.config = __config; __r = cargarCsvRendimientos("id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date\\n");
      __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});`, S);
    const ret = S.__regs.filter(r => r.categoria === "RETIRADA");
    assert("una de USDT y otra de POL", ret.map(r => r.contrato).sort().join() === [USDT, "pol"].sort().join(),
      ret.map(r => r.contrato));
    assert("las dos a revisar", ret.length === 2 && ret.every(r => r.revisar === true), ret.map(r => r.revisar));
  }

  console.log("\n" + ok + " OK, " + fallos + " fallos");
  if (fallos) process.exit(1);
}
main();
