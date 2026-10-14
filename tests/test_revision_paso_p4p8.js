/* Test de la tanda P, P4 y P8 (🔍 Revisión).
 *
 * Bajo prueba:
 * - P8 (js/05, saneaCatalogoYRoles): una DESCARTADA de una copia vieja pasa
 *   al spam de todo el token (spam_usuario.tokens) y queda con dudas; no
 *   pisa lo que ya estaba en el spam; con el bloque de spam mal escrito no
 *   se toca; dos veces da lo mismo.
 * - P4 (js/15, ccOpcionesDecision + ccContextoCandidatos): «🏠 Es un
 *   inmueble» solo en un token con dudas del catálogo (no en uno mandado al
 *   spam, ni en un inmueble, ni en lo sacado del archivo de Reental).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_revision_paso_p4p8.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "08-coingecko.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js", "11-panel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
vm.runInContext("log = function () {};", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const json = x => JSON.stringify(x);
const dir = c => "0x" + c.repeat(40);
const A = dir("a"), B = dir("b"), C = dir("c"), D = dir("d");

console.log("== P8 · DESCARTADA de una copia vieja ==");
const vieja = () => ({
  catalogo_propiedades: {
    [A]: { nombre_reental: "Cáceres 8", simbolo: "RCAC8", estado: "CONFIRMADA" },
    [B.toUpperCase().replace("0X", "0x")]: { nombre_etherscan: "Basura", simbolo: "BAS", estado: " descartada " },
    [C]: { nombre_etherscan: "Otra", estado: "DESCARTADA" },
  },
});
let c = vieja();
S.saneaCatalogoYRoles(c);
assert("pasa al spam de todo el token (normalizada, con su símbolo; sin símbolo, solo la fecha)",
  json(c.spam_usuario) === json({ tokens: { [B]: { fecha: "", simbolo: "BAS" }, [C]: { fecha: "" } } }), c.spam_usuario);
assert("queda con dudas; el inmueble no se toca",
  c.catalogo_propiedades[C].estado === "CANDIDATA" && c.catalogo_propiedades[A].estado === "CONFIRMADA");
assert("en el catálogo ya sale como spam (fuera de la lista)",
  json(S.pnFilasVisibles(S.pnFilasCatalogo(c)).map(f => f.addr)) === json([A]));
const antes = json(c);
S.saneaCatalogoYRoles(c);
assert("dos veces, lo mismo", json(c) === antes);

c = vieja();
c.spam_usuario = { direcciones: { [D]: { fecha: "2026-01-01" } }, tokens: { [C]: { fecha: "2026-02-02", simbolo: "OTR" } } };
S.saneaCatalogoYRoles(c);
assert("no pisa lo que ya estaba en el spam y conserva las direcciones",
  json(c.spam_usuario) === json({ direcciones: { [D]: { fecha: "2026-01-01" } }, tokens: { [C]: { fecha: "2026-02-02", simbolo: "OTR" }, [B]: { fecha: "", simbolo: "BAS" } } }), c.spam_usuario);

for (const malo of ["texto", [], { tokens: "texto" }]) {
  c = vieja();
  c.spam_usuario = malo;
  S.saneaCatalogoYRoles(c);
  assert("bloque de spam mal escrito (" + json(malo) + "): no se toca y sigue DESCARTADA",
    json(c.spam_usuario) === json(malo) && c.catalogo_propiedades[C].estado === "DESCARTADA");
}

console.log("== P4 · «🏠 Es un inmueble» en la tarjeta ==");
const cache = {
  catalogo_propiedades: {
    [A]: { estado: "CONFIRMADA", nombre_reental: "Cáceres 8" },
    [B]: { estado: "CANDIDATA", nombre_etherscan: "Rentas 3" },
    [C]: { estado: "CANDIDATA", nombre_etherscan: "Spam" },
  },
  spam_usuario: { tokens: { [C]: { fecha: "" } } },
};
const W = dir("1"), T = dir("7");
const ctx = S.ccContextoCandidatos(cache, { wallet: W }, []);
assert("el contexto lleva los tokens con dudas, sin los del spam", json([...ctx.dudas]) === json([B]), [...ctx.dudas]);
const reg = (contrato, extra) => Object.assign({ clave: "k", hash: "0x" + "ab".repeat(32), categoria: "REVISAR", contrato,
  origen: T, destino: W, cantidad: 3, simbolo: "X" }, extra);
const ids = r => S.ccOpcionesDecision(r, ctx).map(o => o.id);
const opsB = S.ccOpcionesDecision(reg(B), ctx);
assert("token con dudas: «🏠 Es un inmueble» primero, con su burbuja",
  opsB[0].id === "inmueble" && opsB[0].etiqueta === "🏠 Es un inmueble" && !opsB[0].pide && /catálogo/.test(opsB[0].ayuda), opsB);
assert("y siguen neutro y spam", json(ids(reg(B))) === json(["inmueble", "neutro", "spam"]), ids(reg(B)));
assert("también en lo que sale", ids(reg(B, { origen: W, destino: T }))[0] === "inmueble");
assert("no en un token mandado al spam", !ids(reg(C)).includes("inmueble"));
assert("no en un inmueble confirmado", !ids(reg(A)).includes("inmueble"));
assert("no en lo sacado del archivo de Reental", !ids(reg(B, { fuente: "CSV_REENTAL" })).includes("inmueble"));
assert("sin contexto de dudas (otro llamador), nada", !S.ccOpcionesDecision(reg(B), {}).some(o => o.id === "inmueble"));

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
