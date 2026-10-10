/* Test: las notas de los registros con las palabras del glosario, en la app.
 *
 * - La clasificación escribe las notas nuevas (casos: rendimiento pendiente,
 *   rendimiento sin transferencia descargada, rendimiento mixto).
 * - Los textos que el descubrimiento guardó en la cache con las palabras de
 *   antes no se tocan: se traducen al enseñarlos (textoCacheVigente,
 *   usado por js/11).
 * - Que ningún texto de la app lleve una palabra retirada lo comprueba
 *   tests/test_textos_paso_rend2.js, que mira también las notas de js/14 y
 *   no admite excepciones.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_notas_paso_rend3d.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const JS = path.join(RAIZ, "Reental-SPA", "js");
const sb = { console, state: {} };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"]) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), sb, { filename: f });
}
vm.runInContext("log = function () {}; toast = function () {};", sb);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "e1".repeat(20);
const CAB = "id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date";
const h = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
const fila = (n, div, dist, ret, reinv, claimed, claims, reinvests) =>
  `"${n}","${div}","id${n}","${W}","${dist}","${ret}","${reinv}","${claimed}","${claims}","${reinvests}","2026-09-10T00:00:00.000Z"`;
const lista = hs => "[" + hs.map(x => '""' + x + '""').join(",") + "]";

console.log("== 1. Notas de la clasificación ==");
const csv = sb.cargarCsvRendimientos([CAB,
  fila(1, "Prueba ES #9/2026", 7, 0, 0, 0, "[]", "[]"),                        // pendiente
  fila(2, "Prueba ES #8/2026", 10, 0, 10, 0, "[]", lista([h(1)])),            // sin transferencia descargada
  fila(3, "Prueba ES #7/2026", 10, 0, 6, 4, lista([h(2)]), "[]"),             // mixto
].join("\n"));
sb.state.config = { wallet: W, vault: "" };
const regs = sb.clasificarTransacciones(sb.cacheVacia(), csv.filas, csv.indicePorHash, sb.state.config);
const por = sub => regs.find(r => r.subcategoria === sub);
assert("pendiente: «rendimiento pendiente (ni reclamado ni reinvertido)… archivo de Reental»",
  por("RCM_PENDIENTE") && por("RCM_PENDIENTE").nota ===
    "rendimiento pendiente (ni reclamado ni reinvertido): sin hash, datos tomados del archivo de Reental", por("RCM_PENDIENTE"));
assert("sin transferencia descargada: «importe tomado del archivo de Reental (sin vault…)»",
  por("RCM_REINVERTIDO") && por("RCM_REINVERTIDO").nota ===
    "sin transferencia descargada para este hash: importe tomado del archivo de Reental (sin vault no hay con que contrastarlo)",
  por("RCM_REINVERTIDO"));
assert("mixto: «rendimiento mixto reinvertido/reclamado»",
  por("RCM_MIXTO") && por("RCM_MIXTO").nota.endsWith("rendimiento mixto reinvertido/reclamado"), por("RCM_MIXTO"));
const FUERA = /dividendo|\bbrut[oa]s?\b|\brewards?\b|propiedad(es)?\b|deveng|distribuido\b|coste FIFO|\bCSV\b/i;
assert("ninguna nota con palabras retiradas", regs.every(r => !FUERA.test(r.nota || "")), regs.map(r => r.nota));

console.log("== 2. Textos guardados en la cache ==");
assert("los textos de antes se traducen al enseñarlos",
  sb.textoCacheVigente("Distribuidor de dividendos (cruce CSV)") === "Distribuidor de rendimientos (cruce con el archivo de Reental)" &&
  sb.textoCacheVigente("Settlement (burn de propiedad + USDT al vault)") === "Settlement (burn de tokens de un inmueble + USDT al vault)" &&
  sb.textoCacheVigente("Settlement (burn de propiedad + stablecoin al vault)") === "Settlement (burn de tokens de un inmueble + stablecoin al vault)");
assert("los de hoy y cualquier otro texto se quedan como están",
  sb.textoCacheVigente("Distribuidor de rendimientos (cruce con el archivo de Reental)") === "Distribuidor de rendimientos (cruce con el archivo de Reental)" &&
  sb.textoCacheVigente("SushiSwap: pool RNT/USDT") === "SushiSwap: pool RNT/USDT" && sb.textoCacheVigente("toString") === "toString" &&
  sb.textoCacheVigente(null) === null);
const js11 = fs.readFileSync(path.join(JS, "11-panel.js"), "utf8");
// La tabla de contratos se pinta con HTML; el nombre pasa por textoCacheVigente.
assert("js/11 enseña el texto traducido y no escribe en la cache",
  /nombre: textoCacheVigente\(nombre\)/.test(js11) && !/\]\s*=\s*textoCacheVigente/.test(js11));
const js10 = fs.readFileSync(path.join(JS, "10-csv-descubrimiento.js"), "utf8");
assert("un contrato nuevo se guarda ya con el texto de hoy",
  js10.includes('"Distribuidor de rendimientos (cruce con el archivo de Reental)"') &&
  js10.includes('"Settlement (burn de tokens de un inmueble + stablecoin al vault)"') &&
  !js10.includes("Distribuidor de dividendos") && !js10.includes("burn de propiedad"));

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
