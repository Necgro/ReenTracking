/* Test unitario de 📒 Transacciones: el pago de una venta vinculada,
 * dentro de su venta.
 *
 * Funciones bajo prueba (Reental-SPA/js/18-transacciones.js):
 * - txRelacionesVinculos: marca plegado el cobro de un vínculo CONFIRMADO
 *   asignado entero (también repartido entre dos ventas); no el que tiene
 *   resto sin asignar, ni el de un vínculo ANULADO, ni el de una venta que
 *   no está en la sesión.
 * - txPasaFiltros / txFiltrar con plegarCobros: fuera de la tabla salvo al
 *   buscar (su hash lo enseña); sin plegarCobros, no se pliega nada.
 * - txConteoCategorias y txResumenTriaje: cuentan lo que se ve.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_tx1d.js
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
const USDC = vm.runInContext("USDC", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "11".repeat(20), T = "0x" + "77".repeat(20), P1 = "0x" + "a1".repeat(20);
const H = n => "0x" + String(n).padStart(4, "0") + "cd".repeat(30);
function reg(clave, categoria, subcategoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-05-12 09:45:46", hash: H(clave.length), contrato: P1, token: null, simbolo: null,
    cantidad: 1, categoria, subcategoria, inmueble: null, importe_usdt: null, coste_eur: null,
    origen: W, destino: T, fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}
const CACHE = { catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Ribera 1" } },
  contratos_aprendidos: {}, transacciones: { wallet_tokens: [], vault_tokens: [], wallet_normales: [], vault_normales: [] } };
const ref = r => S.ccReferenciaDeRegistro(r, CACHE);
const cobro = (clave, n, cantidad) => reg(clave, "DEPOSITO", "COSTE_BASE", { contrato: USDC, simbolo: "USDC",
  origen: T, destino: W, hash: H(n), cantidad, fecha: "2026-05-20 10:00:00" });
const venta = (clave, n) => reg(clave, "VENTA", "GPP_INMUEBLE", { inmueble: "Prueba Ribera 1", simbolo: "Reental-RIB-1", hash: H(n) });
const claves = l => l.map(r => r.clave).sort().join(",");

// Escenario: 2 ventas en la misma transacción, cobradas 8 días después
// en 2 depósitos (también en una sola transacción), cada uno asignado entero.
const V1 = venta("v1", 30), V2 = Object.assign(venta("v2", 30), { cantidad: 2 });
const C1 = cobro("c1", 31, 500), C2 = cobro("c2", 31, 250);
// Otra venta con un cobro asignado en parte (resto sin asignar).
const V3 = venta("v3", 40), C3 = cobro("c3", 41, 300);
// Un depósito suelto, sin vínculo.
const D = cobro("d", 50, 80);
// Un cobro repartido entero entre dos ventas.
const V4 = venta("v4", 60), V5 = venta("v5", 61), C4 = cobro("c4", 62, 100);
// Un cobro de un vínculo anulado.
const V6 = venta("v6", 70), C6 = cobro("c6", 71, 90);
const REGS = [V1, V2, C1, C2, V3, C3, D, V4, V5, C4, V6, C6];
// La marca que deja el motor en los cobros de los vínculos que aplica (solo
// esos se pliegan).
for (const [c, id] of [[C1, "pd_1"], [C2, "pd_2"], [C3, "pd_3"], [C4, ["pd_4", "pd_5"]]]) c.pago_diferido = { venta_id: id, rol: "pago" };
const VENTAS = [
  { id: "pd_1", estado: "CONFIRMADO", salida: ref(V1),
    asignaciones: [{ id: "as_1", pago: ref(C1), cantidad_asignada: 500 }] },
  { id: "pd_2", estado: "CONFIRMADO", salida: ref(V2),
    asignaciones: [{ id: "as_2", pago: ref(C2), cantidad_asignada: 250 }] },
  { id: "pd_3", estado: "CONFIRMADO", salida: ref(V3),
    asignaciones: [{ id: "as_3", pago: ref(C3), cantidad_asignada: 200 }] },
  { id: "pd_4", estado: "CONFIRMADO", salida: ref(V4), asignaciones: [{ id: "as_4", pago: ref(C4), cantidad_asignada: 60 }] },
  { id: "pd_5", estado: "CONFIRMADO", salida: ref(V5), asignaciones: [{ id: "as_5", pago: ref(C4), cantidad_asignada: 40 }] },
  { id: "pd_6", estado: "ANULADO", salida: ref(V6), asignaciones: [{ id: "as_6", pago: ref(C6), cantidad_asignada: 90 }] },
];

// =========================================================================
console.log("== 1. Qué cobros van dentro de su venta ==");
// =========================================================================
const rel = S.txRelacionesVinculos(REGS, VENTAS);
const pl = REGS.filter(r => S.txEsCobroPlegado(r, rel)).map(r => r.clave).sort().join(",");
assert("plegados: los dos de CBR-1 y el repartido entero entre dos ventas", pl === "c1,c2,c4", pl);
assert("el asignado en parte (300, 200 asignados) sigue a la vista", !S.txEsCobroPlegado(C3, rel));
assert("el de un vínculo ANULADO vuelve a ser un depósito", !S.txEsCobroPlegado(C6, rel));
assert("el depósito suelto, a la vista", !S.txEsCobroPlegado(D, rel));
assert("las ventas nunca se pliegan", ![V1, V2, V3, V4, V5].some(r => S.txEsCobroPlegado(r, rel)));
assert("sin relaciones (llamadas de antes) no se pliega nada", !S.txEsCobroPlegado(C1));

const relSinVenta = S.txRelacionesVinculos([C1, C2], VENTAS);
assert("si la venta no está en la sesión, el cobro no se pliega (no desaparece)",
  !S.txEsCobroPlegado(C1, relSinVenta) && !S.txEsCobroPlegado(C2, relSinVenta));
const C7 = cobro("c7", 80, null);
const relSinCant = S.txRelacionesVinculos([V1, C7], [{ id: "pd_7", estado: "CONFIRMADO", salida: ref(V1),
  asignaciones: [{ id: "as_7", pago: ref(C7), cantidad_asignada: 10 }] }]);
assert("cobro sin cantidad numérica: no se supone entero", !S.txEsCobroPlegado(C7, relSinCant));

// =========================================================================
console.log("== 2. La tabla ==");
// =========================================================================
const F = { plegarCobros: true };
const vistos = claves(S.txFiltrar(REGS, F, rel));
assert("CBR-1 queda en sus 2 filas de venta, sin los 2 depósitos",
  vistos === "c3,c6,d,v1,v2,v3,v4,v5,v6", vistos);
assert("sin plegarCobros, como antes: todo", S.txFiltrar(REGS, {}, rel).length === REGS.length);
assert("buscar el hash del pago lo enseña", claves(S.txFiltrar(REGS, { plegarCobros: true, q: C1.hash }, rel)) === "c1,c2");
assert("buscar el inmueble enseña la venta Y sus pagos (T74 sigue valiendo)",
  claves(S.txFiltrar(REGS, { plegarCobros: true, q: "ribera" }, rel)) === claves(REGS.filter(r => r !== C6 && r !== D)));
assert("elegir el chip Depósito no los saca (van dentro de su venta)",
  claves(S.txFiltrar(REGS, { plegarCobros: true, categoria: "DEPOSITO" }, rel)) === "c3,c6,d");

const relAnulado = S.txRelacionesVinculos(REGS, VENTAS.map(v => v.id === "pd_1" || v.id === "pd_2" ? Object.assign({}, v, { estado: "ANULADO" }) : v));
assert("anular el vínculo devuelve los 2 depósitos a la tabla",
  claves(S.txFiltrar(REGS, F, relAnulado).filter(r => r.categoria === "DEPOSITO")) === "c1,c2,c3,c6,d");

// =========================================================================
console.log("== 3. Recuentos ==");
// =========================================================================
const conteo = S.txConteoCategorias(REGS, F, rel);
const dep = (conteo.find(c => c.categoria === "DEPOSITO") || {}).n;
assert("chip Depósito: 3 (6 depósitos menos los 3 plegados)", dep === 3, conteo);
const triaje = S.txResumenTriaje(REGS, rel);
assert("triaje sin los plegados: total 9", triaje.total === 9, triaje);
assert("triaje sin rel (llamadas de antes): total 12", S.txResumenTriaje(REGS).total === 12);

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
