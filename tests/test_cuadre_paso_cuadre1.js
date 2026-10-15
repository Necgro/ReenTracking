/* Test: el archivo de Reental y la blockchain no cuadran.
 *
 * Bajo prueba:
 * - js/14 clasificarIndividual: lo que llega a la WALLET desde un
 *   distribuidor sin estar en el archivo es un rendimiento reclamado a
 *   revisar (regla 3b); si su hash SÍ está en el archivo (fila reclamada o
 *   reinvertida en dos veces), queda a revisar sin ser otro rendimiento,
 *   en la wallet y en el vault (en el vault no cuenta dos veces).
 * - js/19 arrDescuadres / arrResumen: cuántos avisos de cada lado y sus
 *   líneas en el resumen de la Puesta en marcha, con su remedio.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_cuadre_paso_cuadre1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
function nuevoSandbox(archivos) {
  const sb = { console, state: {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext("log = function () {}; toast = function () {};", sb);
  return sb;
}
const MOTOR = ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"];

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const WALLET = "0x" + "e1".repeat(20), VAULT = "0x" + "e2".repeat(20);
const DISTRIBUIDOR = "0x" + "d7".repeat(20), DESCONOCIDO = "0x" + "e9".repeat(20);
const USDT = vm.runInContext("USDT", nuevoSandbox(MOTOR));
const CABECERA = "id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date";
const h = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
const ts = (a, m, d) => String(Math.floor(Date.UTC(a, m - 1, d, 12) / 1000));
const tx = (hash, origen, destino, unidades, marca) => ({
  hash, contractAddress: USDT, from: origen, to: destino, value: String(Math.round(unidades * 1e6)),
  tokenDecimal: "6", tokenName: "USDT0", tokenSymbol: "USDT0", timeStamp: marca,
});
const coma = x => String(x).replace(".", ",");
const lista = hs => "[" + hs.map(x => '""' + x + '""').join(",") + "]";
const filaCsv = (n, distributed, retained, reinvested, claimed, o = {}) =>
  `"${n}","Prueba ES #8/2026","id${n}","${WALLET}","${coma(distributed)}","${coma(retained)}",` +
  `"${coma(reinvested)}","${coma(claimed)}","${lista(o.claims || [])}","${lista(o.reinvests || [])}","2026-08-31T11:00:00.000Z"`;

function clasificar(filas, transfers) {
  const sb = nuevoSandbox(MOTOR);
  const cache = sb.cacheVacia();
  cache.contratos_aprendidos.DISTRIBUIDOR[DISTRIBUIDOR] = "Distribuidor";
  cache.transacciones.wallet_tokens = transfers.filter(t => [t.from, t.to].includes(WALLET));
  cache.transacciones.vault_tokens = transfers.filter(t => [t.from, t.to].includes(VAULT));
  Object.assign(sb, { __cache: cache, __csv: [CABECERA, ...filas].join("\n") + "\n",
    __config: { wallet: WALLET, vault: VAULT, compra_bancaria_coste_eur_por_token: 100.0 } });
  vm.runInContext(`state.config = __config; __r = cargarCsvRendimientos(__csv);
    __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});`, sb);
  return sb.__regs;
}
const NOTA = "rendimiento huérfano no cubierto por el archivo de Reental";
const delHash = (regs, x) => regs.filter(r => r.hash === x);
const rend = regs => regs.filter(r => r.categoria === "RENDIMIENTO");

console.log("== 1. Regla 3b: a la wallet sin estar en el archivo ==");
let regs = clasificar([], [tx(h(1), DISTRIBUIDOR, WALLET, 8.1, ts(2026, 9, 1))]);
let [r] = delHash(regs, h(1));
assert("rendimiento reclamado a revisar, con la nota de huérfano",
  r.categoria === "RENDIMIENTO" && r.subcategoria === "RCM_RECLAMADO" && r.revisar && r.nota.includes(NOTA) && r.importe_usdt === 8.1, r);
[r] = delHash(clasificar([], [tx(h(2), DISTRIBUIDOR, VAULT, 5, ts(2026, 9, 1))]), h(2));
assert("al vault, como siempre (reinvertido huérfano)", r.subcategoria === "RCM_REINVERTIDO" && r.revisar && r.nota.includes(NOTA), r);
[r] = delHash(clasificar([filaCsv(1, 10, 1.9, 0, 8.1, { claims: [h(3)] })], [tx(h(3), DISTRIBUIDOR, WALLET, 8.1, ts(2026, 9, 1))]), h(3));
assert("con su fila, no es huérfano", !r.revisar && !r.nota.includes(NOTA), r);
[r] = delHash(clasificar([], [tx(h(6), DESCONOCIDO, WALLET, 20, ts(2026, 9, 1))]), h(6));
assert("de un desconocido, sigue siendo un depósito", r.categoria === "DEPOSITO", r);

console.log("== 2. Hash del archivo que no casa con su fila: no se cuenta dos veces ==");
regs = clasificar([filaCsv(1, 10, 1.9, 0, 8.1, { claims: [h(4), h(5)] })],
  [tx(h(4), DISTRIBUIDOR, WALLET, 4.05, ts(2026, 9, 1)), tx(h(5), DISTRIBUIDOR, WALLET, 4.05, ts(2026, 9, 20))]);
assert("wallet: un solo rendimiento (la fila) y ninguna nota de huérfano",
  rend(regs).length === 1 && !regs.some(x => String(x.nota).includes(NOTA)), rend(regs));
regs = clasificar([filaCsv(1, 10, 0, 10, 0, { reinvests: [h(7), h(8)] })],
  [tx(h(7), DISTRIBUIDOR, VAULT, 5, ts(2026, 9, 1)), tx(h(8), DISTRIBUIDOR, VAULT, 5, ts(2026, 9, 20))]);
const sueltas = regs.filter(x => x.categoria === "REVISAR");
assert("vault: un solo rendimiento (antes, 3) y las 2 transferencias a revisar «ya se declara con la fila»",
  rend(regs).length === 1 && sueltas.length === 2 && sueltas.every(x => x.revisar && x.nota.includes("ya se declara con la fila")), regs);

console.log("== 3. Avisos de la Puesta en marcha (js/19) ==");
const A = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "04-config.js", "14-clasificador.js", "19-arranque.js"]);
const mk = (cat, nota, revisar = true) => ({ categoria: cat, nota, revisar });
const dc = A.arrDescuadres([
  mk("RENDIMIENTO", "sin transferencia descargada ...(puede que el archivo de Reental sea más nuevo que la cache)"),
  mk("RENDIMIENTO", NOTA + ": verificar"), mk("RENDIMIENTO", NOTA + ": verificar; Mandado a revisar desde la SPA (x)"),
  mk("RENDIMIENTO", NOTA, false), mk("REVISAR", NOTA), mk("RENDIMIENTO", "otra cosa")]);
assert("cuenta solo lo marcado a revisar: 1 del archivo sin descargar y 2 sin archivo",
  dc.csvMasNuevo === 1 && dc.sinArchivo === 2, dc);
const lineas = n => A.arrResumen({ clasificacion: { registros: 9, revisar: 0, inmuebles: 1 }, vaultConfigurado: true, descuadres: n })
  .lineas.filter(l => l.texto.includes("archivo de Reental"));
assert("sin descuadres, ninguna línea", lineas({ csvMasNuevo: 0, sinArchivo: 0 }).length === 0 && lineas(null).length === 0);
let ls = lineas({ csvMasNuevo: 1, sinArchivo: 0 });
assert("1 del archivo: singular, «Pulsa «🔄 Actualizar».» y «ver en Revisión»", ls.length === 1 && ls[0].tipo === "warn" &&
  ls[0].texto === "<b>1</b> rendimiento del archivo de Reental aún no está descargado. Pulsa «🔄 Actualizar»." &&
  ls[0].accion.texto === "ver en Revisión" && ls[0].accion.fn === "revision", ls);
ls = lineas({ csvMasNuevo: 0, sinArchivo: 1234 });
assert("1.234 sin archivo: plural, número a la española y «cambiar el archivo»", ls.length === 1 &&
  ls[0].texto === "<b>1.234</b> rendimientos recibidos no están en el archivo de Reental. Carga uno más nuevo." &&
  ls[0].accion.ir === "dzCsv", ls);
assert("los dos a la vez: dos líneas", lineas({ csvMasNuevo: 2, sinArchivo: 3 }).length === 2);

console.log("");
console.log(ok + "/" + (ok + fallos) + " comprobaciones OK -> " + (fallos ? "HAY FALLOS" : "TODO VERDE"));
process.exit(fallos ? 1 : 0);
