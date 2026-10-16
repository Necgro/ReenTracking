/* Test unitario: la lista de 🔍 Revisión solo trae lo que pide decisión.
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - ccMotivoRevision: "revisar" / "salida" / "cobro" / null. Lo que la
 *   clasificación ya resolvió (gas, spam, depósitos de un traspaso propio,
 *   compras, ventas con su cobro, rendimientos, salidas y cobros ya
 *   vinculados) devuelve null.
 * - ccColaRevision: a revisar + salidas por vincular. Los depósitos sin
 *   explicar no entran: no piden decisión.
 * - ccResumen.enLista y ccHtmlCabecera: cuántos hay en la lista y cuántos,
 *   ya clasificados, están en 📒 Transacciones (con enlace).
 * - ccHtmlLista: solo cards de lo que necesita decisión; «✅ Nada que
 *   revisar» cuando no hay nada; con filtros sin resultados, el aviso de
 *   los filtros.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_revision_paso_tx2.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
const { ccContextoCandidatos, ccMotivoRevision, ccColaRevision, ccResumen, ccPendienteDeVincular,
        ccHtmlCabecera, ccHtmlLista, ccReferenciaDeRegistro } = sandbox;
const USDT = vm.runInContext("USDT", sandbox);
const USDC = vm.runInContext("USDC", sandbox);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

/* ------------------------- Datos sintéticos ------------------------- */
const W = "0x" + "11".repeat(20);   // wallet propia
const V = "0x" + "22".repeat(20);   // vault propio
const T = "0x" + "77".repeat(20);   // tercero
const P1 = "0x" + "a1".repeat(20);  // inmueble CONFIRMADO
const RARO = "0x" + "f0".repeat(20); // token que no está en el catálogo
const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);

function reg(clave, contrato, origen, destino, cantidad, categoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-05-12 09:45:46", hash: H(clave.length + cantidad),
    contrato: String(contrato).toLowerCase(), token: null, simbolo: null, cantidad,
    categoria, subcategoria: "X", inmueble: null, importe_usdt: null,
    origen: origen.toLowerCase(), destino: destino.toLowerCase(),
    fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}

const S1 = reg("s1", P1, W, T, 250, "MOVIMIENTO", { inmueble: "Prueba Alcazaba 1", hash: H(1) });   // salida sin cobro
// S2 y C2 con la marca que pone el motor al aplicar el vínculo.
const S2 = reg("s2", P1, W, T, 40, "MOVIMIENTO", { inmueble: "Prueba Alcazaba 1", hash: H(2),
  pago_diferido: { venta_id: "pd_prueba_001", rol: "salida" } });    // salida YA vinculada
const C1 = reg("c1", USDC, T, W, 300, "DEPOSITO", { simbolo: "USDC", hash: H(3) });                 // cobro sin explicar
const C2 = reg("c2", USDC, T, W, 120, "DEPOSITO", { simbolo: "USDC", hash: H(4),
  pago_diferido: { venta_id: "pd_prueba_001", rol: "pago" } });                 // cobro YA asignado del todo
const R1 = reg("r1", RARO, T, W, 5, "REVISAR", { revisar: true, simbolo: "RARO", hash: H(5) });     // token raro a revisar
const R2 = reg("r2", USDT, T, W, 77, "REVISAR", { revisar: true, simbolo: "USDT", hash: H(6) });    // cobro que además está a revisar
const R3 = reg("r3", P1, T, W, 10, "COMPRA", { revisar: true, inmueble: "Prueba Alcazaba 1", hash: H(7),
  nota: "Mandado a revisar desde la SPA" });                                                          // mandado a revisar por el usuario
const YA = [
  reg("g1", "", W, T, 0.01, "COMISION", { hash: H(8) }),
  reg("x1", RARO, T, W, 1000, "SPAM", { hash: H(9) }),
  reg("v1", P1, W, T, 20, "VENTA", { importe_usdt: 2000, inmueble: "Prueba Alcazaba 1", hash: H(10) }),
  reg("d1", USDT, T, W, 12, "RENDIMIENTO", { simbolo: "USDT", hash: H(11) }),
  reg("k1", P1, T, W, 5, "COMPRA", { inmueble: "Prueba Alcazaba 1", hash: H(12) }),
  reg("n1", USDT, W, V, 50, "MOVIMIENTO", { simbolo: "USDT", hash: H(13) }),
];
const REGS = [YA[0], S1, YA[1], C1, R1, YA[2], S2, C2, R2, YA[3], R3, YA[4], YA[5]];

const CACHE = {
  catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1" } },
  contratos_aprendidos: {},
  transacciones: { wallet_tokens: [], vault_tokens: [], wallet_normales: [], vault_normales: [] },
  pagos_diferidos: { version: 1, ventas: [] },
};
const CONFIG = { wallet: W, vault: V };
CACHE.pagos_diferidos.ventas.push({
  id: "pd_prueba_001", estado: "CONFIRMADO", estado_liquidacion: "COMPLETA",
  salida: ccReferenciaDeRegistro(S2, CACHE),
  asignaciones: [{ id: "a1", pago: ccReferenciaDeRegistro(C2, CACHE), cantidad_asignada: 120 }],
});
const ctx = ccContextoCandidatos(CACHE, CONFIG, REGS);

// =========================================================================
console.log("== 1. ccMotivoRevision: qué necesita una decisión ==");
// =========================================================================
assert("el vínculo de la fixture se resuelve (S2 vinculada, C2 asignado)",
  ctx.salidasVinculadas.has("s2") && ctx.cobrosAsignados.has("c2"));
assert("registro a revisar -> «revisar» (token raro)", ccMotivoRevision(R1, ctx) === "revisar");
assert("mandado a revisar por el usuario desde Transacciones -> «revisar»", ccMotivoRevision(R3, ctx) === "revisar");
assert("un cobro que además está a revisar cuenta como «revisar»", ccMotivoRevision(R2, ctx) === "revisar");
assert("salida de tokens sin cobro -> «salida»", ccMotivoRevision(S1, ctx) === "salida");
assert("4.4b (T70): un depósito sin explicar NO necesita decisión -> nada", ccMotivoRevision(C1, ctx) === null);
assert("salida YA vinculada -> nada (vive en Resueltos)", ccMotivoRevision(S2, ctx) === null);
assert("cobro YA asignado del todo -> nada", ccMotivoRevision(C2, ctx) === null);
assert("lo ya clasificado (gas, spam, venta con cobro, rendimiento, compra, traspaso propio) -> nada",
  YA.every(r => ccMotivoRevision(r, ctx) === null), YA.map(r => ccMotivoRevision(r, ctx)));
assert("sin registro -> null (no se rompe)", ccMotivoRevision(null, ctx) === null);

// =========================================================================
console.log("== 2. ccColaRevision: la lista estrecha ==");
// =========================================================================
const cola = ccColaRevision(REGS, ctx);
const claves = l => l.map(r => r.clave).join(",");
assert("a revisar + salidas por vincular, en el orden de la clasificación",
  claves(cola) === "s1,r1,r2,r3", claves(cola));
assert("de 13 registros, 4 en la lista y 9 fuera (ya clasificados, depósitos y ya vinculados)",
  cola.length === 4 && REGS.length === 13);
assert("con todo ya clasificado la lista queda vacía", ccColaRevision(YA.concat([C1]), ctx).length === 0);
assert("sin registros no se rompe", ccColaRevision(null, ctx).length === 0);
assert("los registros NO se tocan (misma referencia, sin campos nuevos)",
  cola[0] === S1 && !("motivo" in S1));

// =========================================================================
console.log("== 3. Cabecera: cuántos hay y dónde está el resto ==");
// =========================================================================
const res = ccResumen(REGS, ctx, false);
assert("ccResumen.enLista = 4; total 13; a revisar 3; 1 salida",
  res.enLista === 4 && res.total === 13 && res.pendientes === 3 && res.salidas === 1, res);
const cab = ccHtmlCabecera(REGS, ctx);
// Textos de Revisión: una línea, sin repetir lo que hay en Transacciones.
assert("cabecera: «1 venta por vincular», sin cobros (cuántos hay por decidir lo dice su fila, P21)",
  !cab.includes("por decidir") && cab.includes("<b>1</b> venta por vincular") &&
  !cab.includes("cobro"), cab.slice(0, 200));
assert("cabecera: sin la línea de «los otros N registros»", !cab.includes("Los otros"), cab);
assert("cabecera: ya no dice que la lista lleva toda la clasificación",
  !cab.includes("clasificación de esta sesión") && !cab.includes("<b>13</b> registros en la lista"));

// =========================================================================
console.log("== 4. ccHtmlLista: solo cards de lo que necesita decisión ==");
// =========================================================================
const nCards = h => (h.match(/class="cc-item[ "]/g) || []).length;
// La lista no tiene filtros (son pocos).
const lista = regs => ccHtmlLista(regs, ccColaRevision(regs, ctx), ctx, CACHE.pagos_diferidos.ventas);
const html = lista(REGS);
assert("4 cards, no 13", nCards(html) === 4, nCards(html));
assert("ninguna card de lo ya clasificado, de los depósitos ni de lo ya vinculado",
  ["g1", "x1", "v1", "d1", "k1", "n1", "s2", "c2", "c1"].every(k => !html.includes('data-clave="' + k + '"')));
assert("la salida por vincular conserva su botón «🔗 Vincular cobro…»",
  /data-accion="abrir-buscador" data-clave="s1"/.test(html) && html.includes("🔗 Vincular cobro…"));
assert("4.4b (T70): sin plegable de cobros ni marca «🔗 cobro»",
  !html.includes("cc-cobros") && !html.includes("Cobros sin explicar") && !html.includes("cc-cand cobro"));

const htmlVacia = lista(YA.concat([C1]));
// Con nada por decidir, «Por decidir» no sale (P21b): la lista, vacía.
assert("sin nada pendiente (aunque haya depósitos): lista vacía, ninguna card", htmlVacia === "", htmlVacia);

const vV = cola.filter(r => ccPendienteDeVincular(r, ctx, false));
assert("por vincular: la salida (y el cobro que además está a revisar)", claves(vV) === "s1,r2", claves(vV));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
