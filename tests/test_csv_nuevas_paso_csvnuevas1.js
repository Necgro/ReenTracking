/* Test: al cargar el archivo de Reental, el aviso dice cuántos repartos son nuevos
 * frente al que ya tenías, cuántos cambiaron y cuántos ya no vienen.
 *
 * Bajo prueba (Reental-SPA/js/12-carga-archivos.js): csvComparar,
 * csvTextoCargado y el aviso de cargarCsv (el primero, sin comparar; uno
 * repetido; uno con nuevos y un reparto cobrado; dos filas con la misma clave).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_csv_nuevas_paso_csvnuevas1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const elementos = {};
const elemento = id => (elementos[id] = elementos[id] || { id, value: "", innerHTML: "", textContent: "", disabled: false,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
const avisos = [];
const S = { console, document: { getElementById: elemento } };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js", "12-carga-archivos.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
S.log = () => {};
S.toast = (msg, tipo) => avisos.push([tipo, msg]);
S.confirm = () => true;
S.escribirArchivoNavegador = async () => {};
S.actualizarChipEstado = () => {};
S.arrTrasCargarCsv = async () => {};
const STATE = vm.runInContext("state", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const W = "0x" + "ab".repeat(20), H = "0x" + "1".repeat(64);
const CAB = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
// [periodo, fecha, reinvertido, cobrado, hash del cobro]
const csv = filas => [CAB, ...filas.map(([p, f, r, c, h]) =>
  "\"" + p + "\"," + f + "," + r + "," + c + "," + (r + c) + ",0,\"[]\",\"" + (h ? "['" + h + "']" : "[]") + "\"," + W)].join("\n") + "\n";
const leer = t => S.cargarCsvRendimientos(t).filas;
const A = [["Cáceres 7 #1/2026", "2026-01-31", 2, 0], ["Cáceres 7 #2/2026", "2026-02-28", 0, 0]];

console.log("== 1. csvComparar ==");
const a = leer(csv(A));
assert("el mismo archivo: nada nuevo ni cambiado", JSON.stringify(S.csvComparar(leer(csv(A)), a)) === '{"nuevos":0,"actualizados":0,"quitados":0}');
const B = [A[0], ["Cáceres 7 #2/2026", "2026-02-28", 0, 3, H], ["Cáceres 7 #3/2026", "2026-03-31", 2, 0], ["Oportunidad 1 #3/2026", "2026-03-31", 1, 0]];
assert("dos nuevos y uno cobrado después (cambia)", JSON.stringify(S.csvComparar(leer(csv(B)), a)) === '{"nuevos":2,"actualizados":1,"quitados":0}', S.csvComparar(leer(csv(B)), a));
assert("uno que ya no viene", JSON.stringify(S.csvComparar(leer(csv([A[0]])), a)) === '{"nuevos":0,"actualizados":0,"quitados":1}');
const DOS = [A[0], A[0]];
assert("la misma clave dos veces: cada fila se empareja una vez",
  JSON.stringify(S.csvComparar(leer(csv(DOS.concat([A[0]]))), leer(csv(DOS)))) === '{"nuevos":1,"actualizados":0,"quitados":0}');
assert("otra wallet, otro reparto", S.csvComparar(leer(csv(A).replace(new RegExp(W, "g"), "0x" + "cd".repeat(20))), a).nuevos === 2);

console.log("== 1b. Auditoría (A1-A3) ==");
const H2 = "0x" + "2".repeat(64);
const SIN_W = ["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims",
  ...A.map(([p, f, r, c]) => '"' + p + '",' + f + "," + r + "," + c + "," + (r + c) + ',0,"[]","[]"')].join("\n") + "\n";
assert("A1: el que tenías sin la columna wallet y el mismo con ella: ninguno nuevo",
  JSON.stringify(S.csvComparar(a, leer(SIN_W))) === '{"nuevos":0,"actualizados":0,"quitados":0}', S.csvComparar(a, leer(SIN_W)));
const COB = [["Cáceres 7 #1/2026", "2026-01-31", 0, 2, H]];
const SIN_CLAIMS = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet\n" +
  '"Cáceres 7 #1/2026",2026-01-31,0,2,2,0,"[]",' + W + "\n";
assert("A2: el que tenías sin la columna claims: un cobrado sin cambios no cuenta como actualizado",
  JSON.stringify(S.csvComparar(leer(csv(COB)), leer(SIN_CLAIMS))) === '{"nuevos":0,"actualizados":0,"quitados":0}', S.csvComparar(leer(csv(COB)), leer(SIN_CLAIMS)));
const dosHashes = orden => CAB + "\n" +
  '"Cáceres 7 #1/2026",2026-01-31,1,1,2,0,"[\'' + orden[0] + '\']","[\'' + orden[1] + '\']",' + W + "\n";
assert("A2: los mismos hashes en otro orden: sin cambios",
  S.csvComparar(leer(dosHashes([H, H2])), leer(dosHashes([H2, H]))).actualizados === 0);
const X1 = ["Cáceres 7 #1/2026", "2026-01-31", 2, 0], Y = ["Cáceres 7 #1/2026", "2026-02-15", 3, 0];
assert("A3: la misma clave dos veces, con la nueva delante: 1 nuevo y ninguno actualizado",
  JSON.stringify(S.csvComparar(leer(csv([Y, X1])), leer(csv([X1])))) === '{"nuevos":1,"actualizados":0,"quitados":0}', S.csvComparar(leer(csv([Y, X1])), leer(csv([X1]))));
const P1 = ["Cáceres 7 #1/2026", "2026-01-31", 0, 1, H], P2 = ["Cáceres 7 #1/2026", "2026-01-31", 0, 2, H], P3 = ["Cáceres 7 #1/2026", "2026-01-31", 0, 3, H];
assert("A3: antes [1, 2], ahora [3, 1]: 1 actualizado",
  JSON.stringify(S.csvComparar(leer(csv([P3, P1])), leer(csv([P1, P2])))) === '{"nuevos":0,"actualizados":1,"quitados":0}', S.csvComparar(leer(csv([P3, P1])), leer(csv([P1, P2]))));

console.log("== 2. csvTextoCargado ==");
assert("sin archivo anterior, como antes", S.csvTextoCargado(1, null) === "Archivo de rendimientos cargado: 1 reparto.");
assert("con todo", S.csvTextoCargado(1250, { nuevos: 3, actualizados: 1, quitados: 2 }) ===
  "Archivo de rendimientos cargado: 1.250 repartos (3 nuevos, 1 actualizado, 2 que ya no trae).", S.csvTextoCargado(1250, { nuevos: 3, actualizados: 1, quitados: 2 }));
assert("ninguno nuevo", S.csvTextoCargado(2, { nuevos: 0, actualizados: 0, quitados: 0 }) === "Archivo de rendimientos cargado: 2 repartos (ninguno nuevo).");
assert("uno nuevo, dos actualizados", S.csvTextoCargado(3, { nuevos: 1, actualizados: 2, quitados: 0 }) === "Archivo de rendimientos cargado: 3 repartos (1 nuevo, 2 actualizados).");

console.log("== 3. El aviso al cargar ==");
const archivo = (nombre, texto) => ({ name: nombre, text: async () => texto });
(async () => {
  STATE.cache = null; STATE.filasCsv = []; STATE.csvCargado = false; STATE.csvArchivo = undefined;
  await S.cargarCsv(archivo("a.csv", csv(A)));
  assert("el primero: sin comparar", avisos.pop()[1] === "Archivo de rendimientos cargado: 2 repartos.");
  await S.cargarCsv(archivo("a.csv", csv(A)));
  assert("el mismo otra vez: ninguno nuevo", avisos.pop()[1] === "Archivo de rendimientos cargado: 2 repartos (ninguno nuevo).");
  await S.cargarCsv(archivo("b.csv", csv(B)));
  assert("el nuevo: 2 nuevos y 1 actualizado", avisos.pop()[1] === "Archivo de rendimientos cargado: 4 repartos (2 nuevos, 1 actualizado).");
  // Con la cache abierta, compara con el que va dentro.
  STATE.cache = S.asegurarEstructuraCache({});
  S.ponerArchivoRendimientosCache(STATE.cache, "a.csv", csv(A));
  STATE.filasCsv = []; STATE.csvCargado = false;
  await S.cargarCsv(archivo("b.csv", csv(B)));
  assert("con la cache: compara con el de dentro", avisos.pop()[1] === "Archivo de rendimientos cargado: 4 repartos (2 nuevos, 1 actualizado).");
  const malo = avisos.length;
  await S.cargarCsv(archivo("c.csv", CAB + "\n"));
  assert("uno vacío no da aviso de cargado", avisos.length === malo + 1 && avisos[avisos.length - 1][0] === "error");

  console.log("\nResultado: " + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})();
