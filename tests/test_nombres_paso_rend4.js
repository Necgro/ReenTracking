/* Test: los nombres de funciones,
 * variables e identificadores de la página con las palabras del glosario,
 * en la app.
 *
 * - En js/ ningún nombre lleva «dividendo», «propiedad», «bruto» ni
 *   «devengo». Se queda lo que nombra la cache (`catalogo_propiedades`
 *   y el campo `propiedad` de un vínculo), las tablas de nombres antiguos y
 *   la columna `dividend` del archivo de Reental.
 * - Las funciones con nombre nuevo existen y las de antes no.
 * - La pestaña Rendimientos es `#rendimientos`; la app lee cualquier
 *   archivo de Reental que se le dé, también el de antes.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_nombres_paso_rend4.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const JS = path.join(RAIZ, "Reental-SPA", "js");
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

/* Código sin comentarios ni textos: quedan solo los nombres. */
function soloNombres(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, " ");
}
const RETIRADAS = /dividendo|propiedad|bruto|devengo/i;
const SE_QUEDAN = new Set(["catalogo_propiedades", "propiedad", "DIVIDENDO", "RCM_DIVIDENDO", "GPP_PROPIEDAD", "bruto_usdt"]);

console.log("== 1. Nombres de la app (js/) ==");
const archivos = fs.readdirSync(JS).filter(f => f.endsWith(".js")).sort();
let mirados = 0;
const malos = {};
for (const f of archivos) {
  for (const nombre of soloNombres(leer("Reental-SPA", "js", f)).match(/[A-Za-z_$][\w$]*/g) || []) {
    mirados++;
    if (RETIRADAS.test(nombre) && !SE_QUEDAN.has(nombre)) (malos[f] = malos[f] || new Set()).add(nombre);
  }
}
assert("se han mirado nombres de verdad (control)", mirados > 20000, mirados);
assert("ningún nombre con «dividendo», «propiedad», «bruto» o «devengo»", Object.keys(malos).length === 0,
  Object.fromEntries(Object.entries(malos).map(([f, s]) => [f, [...s]])));
// Lo que se queda, solo donde toca: el campo `propiedad` es el del vínculo
// guardado en la cache (js/15) y la tabla de campos antiguos (js/02).
const conPropiedad = archivos.filter(f => /(?<![\w$])propiedad(?![\w$])/.test(soloNombres(leer("Reental-SPA", "js", f))));
assert("`propiedad` solo en js/02 (tabla de nombres antiguos) y js/15 (vínculo de la cache, R8)",
  JSON.stringify(conPropiedad) === JSON.stringify(["02-utilidades.js", "15-correcciones.js"]), conPropiedad);

console.log("== 2. Funciones con nombre nuevo ==");
const sb = { console, state: {} };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"]) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), sb, { filename: f });
}
vm.runInContext("log = function () {}; toast = function () {};", sb);
const NUEVAS = ["extraerInmueble", "normalizarNombreInmueble", "cargarCsvRendimientos", "descubrirInmuebles",
  "inmueblesConfirmados", "inmueblesConfirmadosCache", "regla2Rendimientos", "emitirRendimientoCsv",
  "rendimientosSinTransferencia", "rendimientosSinHash", "claveRendimientoCsv"];
const ANTES = ["extraerPropiedad", "normalizarNombrePropiedad", "cargarCsvDividendos", "descubrirPropiedades",
  "propiedadesConfirmadas", "propiedadesConfirmadasCache", "regla2Dividendos", "emitirDividendoCsv",
  "dividendosSinTransferencia", "dividendosSinHash", "claveDividendoSinHash"];
const tipo = n => vm.runInContext("typeof " + n, sb);
assert("las funciones nuevas existen", NUEVAS.every(n => tipo(n) === "function"), NUEVAS.filter(n => tipo(n) !== "function"));
assert("las de antes ya no existen", ANTES.every(n => tipo(n) === "undefined"), ANTES.filter(n => tipo(n) !== "undefined"));

console.log("== 3. El archivo de Reental se lee igual (sus columnas no cambian) ==");
const W = "0x" + "e1".repeat(20);
const csv = sb.cargarCsvRendimientos(
  "id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date\n" +
  `"1","Prueba ES #9/2026","id1","${W}","7","0","0","0","[]","[]","2026-09-10T00:00:00.000Z"`);
assert("una fila, con su inmueble y su periodo", !csv.error && csv.filas.length === 1 &&
  csv.filas[0].inmueble === "Prueba ES" && csv.filas[0].periodo_fiscal === "Prueba ES #9/2026", csv.error || csv.filas);
assert("sin la columna `dividend` de Reental, el archivo no vale",
  !!sb.cargarCsvRendimientos("rendimiento,date\nPrueba ES #9/2026,2026-09-10T00:00:00.000Z").error);
sb.state.config = { wallet: W, vault: "" };
const contexto = sb.construirContexto(sb.cacheVacia());
assert("el contexto de la clasificación lleva `inmuebles`", "inmuebles" in contexto && !("propiedades" in contexto), Object.keys(contexto));
assert("una cache nueva conserva `catalogo_propiedades` (R8)", "catalogo_propiedades" in sb.cacheVacia());

console.log("== 4. La página ==");
const idx = leer("Reental-SPA", "index.html");
assert("la pestaña Rendimientos es #rendimientos", idx.includes('href="#rendimientos"') && idx.includes('id="view-rendimientos"') &&
  !/#dividendos|view-dividendos/.test(idx));
assert("cada enlace del menú tiene su vista",
  [...idx.matchAll(/<a href="#([a-z]+)" title=/g)].every(m => idx.includes('id="view-' + m[1] + '"')));
assert("los identificadores de la página, sin palabras retiradas",
  ![...idx.matchAll(/\b(?:id|for|href|class|data-[a-z-]+)="([^"]*)"/g)].some(m => RETIRADAS.test(m[1])),
  [...idx.matchAll(/\b(?:id|for|href|class|data-[a-z-]+)="([^"]*)"/g)].map(m => m[1]).filter(v => RETIRADAS.test(v)));
// La página no nombra el archivo, para que no parezca que tiene que llamarse así.
assert("la página no nombra el archivo (vale cualquier nombre)", !idx.replace(/<!--[\s\S]*?-->/g, "").includes("reental_rendimientos.csv") && !idx.includes("reental_dividendos"));
assert("la app no exige ningún nombre de archivo (vale también el de antes)",
  !archivos.some(f => /reental_(rendimientos|dividendos)\.csv/.test(leer("Reental-SPA", "js", f))));

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
