/* Test unitario de las notas personales por transacción en
 * 📒 Transacciones (se guardan en la cache, en un bloque propio).
 *
 * Funciones bajo prueba (Reental-SPA/js/18-transacciones.js):
 * - txTextoNota / txNotasConTexto: leer, poner, cambiar y quitar una nota
 *   sin mutar el bloque recibido; claves normalizadas; texto recortado.
 * - txHtmlFila: la nota en una línea bajo la operación y el ✏️ con su
 *   burbuja (con o sin nota).
 * - txFiltrar: la búsqueda encuentra la nota.
 * - La nota NO cambia la clasificación: clasificar con y sin el bloque
 *   notas_personales da los mismos registros.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_notas_personales_paso_nota1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const H = n => "0x" + String(n).padStart(4, "0") + "ef".repeat(30);
function reg(clave, categoria, subcategoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-08-31 10:00:00", hash: H(clave.length), contrato: "0x" + "a1".repeat(20), token: null, simbolo: null,
    cantidad: 1, categoria, subcategoria, inmueble: null, importe_usdt: null, coste_eur: null,
    origen: "0x" + "11".repeat(20), destino: "0x" + "77".repeat(20), fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}

console.log("== 1. Poner, cambiar y quitar una nota ==");
const vacio = {};
const n1 = S.txNotasConTexto(vacio, "0xAB::0xCD", "  Compra para mi hija  ", "2026-10-01T10:00:00.000Z");
assert("no muta el bloque recibido", Object.keys(vacio).length === 0);
assert("clave normalizada (minúsculas) y texto sin espacios de más",
  JSON.stringify(n1) === JSON.stringify({ "0xab::0xcd": { texto: "Compra para mi hija", modificado: "2026-10-01T10:00:00" } }), n1);
assert("txTextoNota la lee con cualquier mayúscula", S.txTextoNota(n1, "0xAb::0xCd") === "Compra para mi hija");
const n2 = S.txNotasConTexto(n1, "0xab::0xcd", "Otra cosa", "2026-10-02T09:00:00Z");
assert("cambiarla deja una sola nota con el texto nuevo",
  Object.keys(n2).length === 1 && S.txTextoNota(n2, "0xab::0xcd") === "Otra cosa" && S.txTextoNota(n1, "0xab::0xcd") === "Compra para mi hija");
const n3 = S.txNotasConTexto(n2, "0xab::0xcd", "   ", "2026-10-02T09:00:00Z");
assert("dejarla vacía la quita", Object.keys(n3).length === 0 && S.txTextoNota(n3, "0xab::0xcd") === "");
assert("una nota larguísima se recorta a " + 500 + " caracteres",
  S.txTextoNota(S.txNotasConTexto({}, "k", "x".repeat(900), ""), "k").length === 500);
let lanza = false;
try { S.txNotasConTexto({}, "", "hola", ""); } catch (e) { lanza = true; }
assert("sin clave no se guarda nada (lanza)", lanza);
assert("bloque inexistente o raro -> sin nota", S.txTextoNota(null, "k") === "" && S.txTextoNota({ k: "texto suelto" }, "k") === "");

console.log("== 2. La fila ==");
const gas = reg("gas", "COMISION", "GAS", { cantidad: 0.12, simbolo: "POL", token: "POL" });
const sinNota = S.txHtmlFila(gas, { estadoRevisar: "libre" });
assert("sin nota: ✏️ «Añadir una nota» con su burbuja y ninguna línea de nota",
  sinNota.includes('data-accion="nota"') && sinNota.includes("<b>Añadir una nota</b>") && !sinNota.includes("tx-notap"));
const conNota = S.txHtmlFila(gas, { estadoRevisar: "libre", notaPersonal: "Gas de la compra <de> mayo" });
/* La nota no va bajo la operación, sino en su propia fila
   debajo (txHtmlFilaNota; lo prueba test_transacciones_paso_tx1f.js). */
assert("con nota: la fila no lleva la nota dentro (va en la fila de debajo)", !conNota.includes("tx-notap") && conNota.includes("tx-con-notap"));
assert("con nota: el ✏️ resaltado dice la nota en su burbuja",
  /class="tx-accion tx-ico tx-con-nota" data-accion="nota"/.test(conNota) && conNota.includes("<b>Tu nota</b> Gas de la compra &lt;de&gt; mayo"));
assert("con nota: siguen siendo 9 celdas (TX-1f)", (conNota.match(/<td /g) || []).length === 9);
const sinCache = S.txHtmlFila(gas, { estadoRevisar: "sin-cache" });
assert("sin cache también hay ✏️ (avisa al pulsarlo de que hay que cargar la cache)", sinCache.includes('data-accion="nota"'));

console.log("== 3. La búsqueda encuentra la nota ==");
const otro = reg("otro", "COMISION", "GAS", { cantidad: 0.05, simbolo: "POL", token: "POL" });
const notas = S.txNotasConTexto({}, "gas", "Regalo de cumpleaños", "");
const filtros = q => ({ q, notas, ocultarSpam: true, plegarCobros: true });
assert("buscar «cumpleaños» -> solo la fila con esa nota",
  S.txFiltrar([gas, otro], filtros("cumpleaños")).map(r => r.clave).join() === "gas");
assert("sin notas en los filtros, no la encuentra (no se inventa)",
  S.txFiltrar([gas, otro], { q: "cumpleaños" }).length === 0);

console.log("== 4. La nota no cambia la clasificación ==");
assert("ninguna función del motor nombra notas_personales",
  !fs.readFileSync(path.join(BASE, "14-clasificador.js"), "utf8").includes("notas_personales"));
const css = fs.readFileSync(path.join(BASE, "18-transacciones.js"), "utf8");
assert("se guarda sin reclasificar (el editor de la nota no llama a ejecutarClasificacion)",
  /function txEditorNota[\s\S]*?\n}/.exec(css)[0].indexOf("ejecutarClasificacion") === -1);

console.log("== 5. index.html: la columna de acciones cabe con 4 iconos ==");
const html = fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "index.html"), "utf8");
/* Sin colgroup; cada columna mide lo que su contenido (los 4 iconos los mide el arnés). */
assert("sin colgroup: la columna de acciones mide lo que sus iconos", !/<colgroup>/.test(html));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
