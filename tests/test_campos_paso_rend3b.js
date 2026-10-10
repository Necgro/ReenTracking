/* Test de los campos de los registros con
 * las palabras del glosario, en la app.
 *
 * - Cada registro lleva `inmueble` (antes `propiedad`) y, en un rendimiento
 *   del archivo de Reental, `integro_usdt` (antes `bruto_usdt`); las filas
 *   del archivo, `inmueble` y `fecha_reparto` (antes `fecha_devengo`).
 * - Dentro de reental_cache.json los nombres no cambian: una
 *   cache nueva conserva `catalogo_propiedades`, el vínculo que guarda
 *   js/15 sigue llevando `propiedad`, y un ajuste que nombre un campo como
 *   antes vale igual.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_campos_paso_rend3b.js
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
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js"]) {
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
const FILA = `"1","Prueba ES #8/2026","id1","${W}","100","19","0","81","[]","[]","2026-08-10T00:00:00.000Z"`;

console.log("== 1. Filas del archivo y registros ==");
const csv = sb.cargarCsvRendimientos([CAB, FILA].join("\n"));
assert("fila del archivo: inmueble y fecha_reparto; sin los nombres antiguos",
  !csv.error && csv.filas[0].inmueble === "Prueba ES" && csv.filas[0].fecha_reparto &&
  !("propiedad" in csv.filas[0]) && !("fecha_devengo" in csv.filas[0]), csv.filas && Object.keys(csv.filas[0]));
sb.state.config = { wallet: W, vault: "" };
const regs = sb.clasificarTransacciones(sb.cacheVacia(), csv.filas, csv.indicePorHash, sb.state.config);
const rend = regs.filter(r => r.categoria === "RENDIMIENTO");
assert("el rendimiento lleva inmueble, integro_usdt (100), retención (19) y lo que llegó (81)",
  rend.length === 1 && rend[0].inmueble === "Prueba ES" && rend[0].integro_usdt === 100 &&
  rend[0].retencion_usdt === 19 && rend[0].importe_usdt === 81, rend[0]);
assert("ningún registro lleva «propiedad» ni «bruto_usdt»",
  regs.every(r => "inmueble" in r && !("propiedad" in r) && !("bruto_usdt" in r)));
assert("el libro enseña el íntegro y el inmueble desde los campos nuevos",
  sb.txImporte(rend[0]) === "100 USD" && sb.txActivo(rend[0]) === "Prueba ES" &&
  sb.txPasaFiltros(rend[0], { inmueble: "Prueba ES" }) && !sb.txPasaFiltros(rend[0], { inmueble: "Otro" }));
const resumen = sb.dashRendimientosResumen(csv.filas);
assert("el panel sigue agrupando por el año del reparto", resumen.porPeriodo.length === 1 && resumen.porPeriodo[0].periodo === "2026");

console.log("== 2. Ajustes del usuario con los nombres antiguos ==");
const base = () => ({ clave: "k1", categoria: "RENDIMIENTO", subcategoria: "RCM_RECLAMADO", nota: "", revisar: false, inmueble: null, integro_usdt: 10 });
const ajustar = (r, a) => { sb.aplicarAjustesUsuario([r], { ajustes_usuario: { [r.clave]: a } }); return r; };
let r = ajustar(base(), { propiedad: "Prueba 1", bruto_usdt: 12.5 });
assert("«propiedad» y «bruto_usdt» en un ajuste → inmueble e integro_usdt",
  r.inmueble === "Prueba 1" && r.integro_usdt === 12.5 && !("propiedad" in r) && !("bruto_usdt" in r), r);
r = ajustar(base(), { inmueble: "Prueba 2", integro_usdt: 7 });
assert("con los nombres de hoy, igual", r.inmueble === "Prueba 2" && r.integro_usdt === 7, r);
assert("campoVigente: propiedad y bruto_usdt, y nada más se traduce",
  JSON.stringify(vm.runInContext("CAMPOS_ANTIGUOS", sb)) === JSON.stringify({ propiedad: "inmueble", bruto_usdt: "integro_usdt" }) &&
  sb.campoVigente("nota") === "nota" && sb.campoVigente("toString") === "toString");
r = ajustar(base(), { nota: "hola" });
assert("la nota se sigue añadiendo", r.nota === "hola");

console.log("== 3. La cache conserva sus nombres (R8) ==");
const vacia = sb.cacheVacia();
assert("cache nueva: catalogo_propiedades, sin catalogo_inmuebles",
  "catalogo_propiedades" in vacia && !("catalogo_inmuebles" in vacia));
const js15 = fs.readFileSync(path.join(JS, "15-correcciones.js"), "utf8");
assert("el vínculo que se guarda en la cache sigue llevando «propiedad», tomada del inmueble del registro",
  /\n\s+propiedad: \(o\.salida && o\.salida\.inmueble\) \|\| null,/.test(js15));

console.log("== 4. El código no usa los campos antiguos ==");
const usos = [];
for (const f of fs.readdirSync(JS).filter(x => x.endsWith(".js"))) {
  let t = fs.readFileSync(path.join(JS, f), "utf8");
  if (f === "02-utilidades.js") t = t.replace(/const CAMPOS_ANTIGUOS = \{[^}]*\};/, "");
  t = t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // sin comentarios
  if (f === "15-correcciones.js") t = t.replace(/\n\s+propiedad: \(o\.salida && o\.salida\.inmueble\) \|\| null,/, "");
  if (/bruto_usdt|fecha_devengo/.test(t)) usos.push(f + ": bruto_usdt / fecha_devengo");
  if (/\.propiedad(?![a-zA-Z_])|(?<![a-zA-Z_.])propiedad:/.test(t)) usos.push(f + ": propiedad");
}
assert("ningún módulo de la app usa un campo antiguo", usos.length === 0, usos);

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
