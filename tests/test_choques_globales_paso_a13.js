/* A13 (auditoría): los módulos de js/ se cargan como scripts normales y
 * comparten el ámbito global. Si dos declaran una función con el mismo
 * nombre, gana la última sin ningún error y la otra deja de usarse. Esta
 * prueba falla si un nombre declarado arriba del todo (function, async
 * function, class, const, let o var en la columna 0) sale dos veces, en
 * el mismo archivo o en dos distintos.
 *
 * Ejecución (desde la raíz): node tests/test_choques_globales_paso_a13.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const JS = path.join(__dirname, "..", "Reental-SPA", "js");
const DECL = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:class|const|let|var)\s+([A-Za-z_$][\w$]*)/;

const donde = new Map(); // nombre -> ["archivo:línea", ...]
for (const f of fs.readdirSync(JS).filter(f => f.endsWith(".js")).sort()) {
  fs.readFileSync(path.join(JS, f), "utf8").split(/\r?\n/).forEach((linea, i) => {
    const m = DECL.exec(linea);
    if (!m) return;
    const nombre = m[1] || m[2];
    if (!donde.has(nombre)) donde.set(nombre, []);
    donde.get(nombre).push(f + ":" + (i + 1));
  });
}
const repetidos = [...donde].filter(([, sitios]) => sitios.length > 1);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
assert("se leen las declaraciones de los módulos (más de 500)", donde.size > 500, donde.size);
assert("ningún nombre global declarado dos veces", repetidos.length === 0,
  repetidos.map(([n, s]) => n + " en " + s.join(", ")));

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
