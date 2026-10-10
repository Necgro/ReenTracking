/* Test unitario de 🔍 Revisión: vínculos de ventas, enlaces y nombres.
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js):
 * - Anular no deja rastro: volver a vincular una venta con vínculos
 *   anulados REUTILIZA el último (mismo id) y junta los demás en su
 *   «historial»; ccHtmlVenta no ofrece «Restaurar».
 * - ccEnlaceHash / ccHtmlRegCorto: el hash corto es el enlace a
 *   Polygonscan (card, buscador, «Resueltos» y formulario).
 * - ccNombreVenta / ccDetalleVinculo / ccTextoVinculada: el nombre
 *   de la venta y de su pago en lugar del id pd_….
 * (Sin cobros en la lista: lo comprueba tests/test_revision_paso_tx2.js.)
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_revision_paso_44b.js
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
const { ccContextoCandidatos, ccVinculoDeRegistro, ccTextoVinculada, ccNombreVenta, ccDetalleVinculo,
        ccAplicarBorradorABloque, ccBorradorVenta, ccAnularVenta, ccHtmlVenta, ccResumenVenta, ccReferenciaDeRegistro, ccEnlaceHash,
        ccHtmlRegCorto, ccHtmlTarjeta, ccHtmlFilaCobro, ccHtmlParColumna } = sandbox;
const USDC = vm.runInContext("USDC", sandbox);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

/* ------------------------- Datos sintéticos ------------------------- */
const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), T = "0x" + "77".repeat(20);
const P1 = "0x" + "a1".repeat(20);
const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
function reg(clave, contrato, origen, destino, cantidad, categoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-05-12 09:45:46", hash: H(1), contrato: String(contrato).toLowerCase(),
    token: null, simbolo: null, cantidad, categoria, subcategoria: "X", inmueble: null,
    importe_usdt: null, origen: origen.toLowerCase(), destino: destino.toLowerCase(),
    fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}
// Con la marca que pone el motor al aplicar el vínculo pd_b.
const S1 = reg("s1", P1, W, T, 3.5, "VENTA", { inmueble: "Prueba Alcazaba 1", simbolo: "Reental-ALC-1", hash: H(2), importe_usdt: 120,
  pago_diferido: { venta_id: "pd_b", rol: "salida" } });
const S3 = reg("s3", P1, W, T, 1, "MOVIMIENTO", { inmueble: "Prueba Alcazaba 1", hash: H(3), fecha: "2026-05-13 10:00:00" });
const S4 = reg("s4", P1, W, T, 2, "MOVIMIENTO", { inmueble: "Prueba Alcazaba 1", hash: H(4), fecha: "2026-05-14 10:00:00" });
const C1 = reg("c1", USDC, T, W, 120, "DEPOSITO", { simbolo: "USDC", hash: H(5), fecha: "2026-05-20 09:00:00",
  pago_diferido: { venta_id: "pd_b", rol: "pago" } });
const C4 = reg("c4", USDC, T, W, 50, "DEPOSITO", { simbolo: "USDC", hash: H(6), fecha: "2026-05-21 09:00:00" });
const REGS = [S1, S3, S4, C1, C4];
const CACHE = {
  catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1" } },
  contratos_aprendidos: {},
  transacciones: { wallet_tokens: [], vault_tokens: [], wallet_normales: [], vault_normales: [] },
  pagos_diferidos: { version: 1, ventas: [] },
};
const ref = r => ccReferenciaDeRegistro(r, CACHE);
const venta = (id, estado, sal, pago, cant) => ({
  id, estado, estado_liquidacion: "COMPLETA", creado: "2026-09-26T10:00:00",
  anulado: estado === "ANULADO" ? "2026-09-26T11:00:00" : null,
  salida: ref(sal), asignaciones: [{ id: "a_" + id, pago: ref(pago), cantidad_asignada: cant }],
});
const A = venta("pd_a", "ANULADO", S1, C1, 120);     // su salida ya tiene otro vínculo (B)
const B = venta("pd_b", "CONFIRMADO", S1, C1, 120);
const D = venta("pd_d", "ANULADO", S3, C1, 30);      // otra salida, pero el cobro ya está asignado del todo
const E = venta("pd_e", "ANULADO", S4, C4, 50);      // sin conflicto
const VENTAS = [A, B, D, E];
CACHE.pagos_diferidos.ventas = VENTAS;

// =========================================================================
console.log("== 1. T77 · anular no deja rastro: se reutiliza el vínculo ==");
// =========================================================================
const aplicar = (ventas, sal, pago, cant) => ccAplicarBorradorABloque(ventas, {
  refSalida: ref(sal),
  borrador: ccBorradorVenta({ refSalida: ref(sal), salida: sal, cobros: [{ reg: pago, ref: ref(pago), cantidad: cant }],
                              estadoLiquidacion: "COMPLETA", nota: "" }),
});
// Caso típico: A (anulado) y B (confirmado) sobre la misma venta.
let r = aplicar([], S4, C4, 50);
assert("vincular una venta sin vínculos: vínculo nuevo", r.ventas.length === 1 && !r.reutilizada && !r.editada);
const id1 = r.ventaId;
let ventas = ccAnularVenta(r.ventas, id1);
r = aplicar(ventas, S4, C4, 40);
assert("anular y volver a vincular: se REUTILIZA el mismo vínculo (mismo id, confirmado, sin crear otro)",
  r.reutilizada && r.ventaId === id1 && r.ventas.length === 1 && r.ventas[0].estado === "CONFIRMADO" &&
  r.ventas[0].anulado === null && r.ventas[0].asignaciones.length === 1 &&
  r.ventas[0].asignaciones[0].cantidad_asignada === 40, r.ventas);
assert("lo anterior queda en su «historial» interno (la asignación de 50)",
  r.ventas[0].historial.length === 1 && r.ventas[0].historial[0].asignaciones[0].cantidad_asignada === 50);
// Diez dudas = un vínculo.
for (let k = 0; k < 10; k++) r = aplicar(ccAnularVenta(r.ventas, id1), S4, C4, 10 + k);
assert("diez anulaciones y diez vínculos: sigue habiendo UN vínculo, con 11 entradas de historial",
  r.ventas.length === 1 && r.ventas[0].id === id1 && r.ventas[0].historial.length === 11 &&
  r.ventas[0].asignaciones[0].cantidad_asignada === 19, r.ventas[0].historial.length);
// Varios anulados antiguos de la misma venta (como A y B si se anula B).
ventas = [A, Object.assign({}, B, { estado: "ANULADO", anulado: "2026-09-27T10:00:00" }), E];
r = aplicar(ventas, S1, C1, 120);
assert("con 2 anulados de la misma venta: se reutiliza el último y el otro se junta en su historial (no queda suelto)",
  r.reutilizada && r.ventaId === "pd_b" && r.ventas.map(v => v.id).join(",") === "pd_b,pd_e" &&
  r.ventas.find(v => v.id === "pd_b").historial.map(h => h.id).join(",") === "pd_a,pd_b", r.ventas.map(v => v.id));
assert("los anulados de OTRAS ventas no se tocan", r.ventas.find(v => v.id === "pd_e").estado === "ANULADO");
r = aplicar([B], S1, C4, 10);
assert("si la venta ya tiene un vínculo confirmado, se le añade el cobro (como antes)",
  r.editada && !r.reutilizada && r.ventas.length === 1 && r.ventas[0].asignaciones.length === 2);
const hA = ccHtmlVenta(A, ccResumenVenta(A, REGS), { nombre: ccNombreVenta(A, REGS) });
assert("un anulado, si llegara a pintarse, no ofrece «Restaurar» ni acciones (solo los saltos a Transacciones)",
  !hA.includes("Restaurar") &&
  !/data-accion="(abrir-buscador|editar-vinculo|anular-vinculo|restaurar-vinculo)"/.test(hA));
const hB = ccHtmlVenta(B, ccResumenVenta(B, REGS), { nombre: ccNombreVenta(B, REGS) });
assert("un confirmado ofrece añadir otro cobro, editar y anular, sin «Restaurar»",
  hB.includes('data-accion="abrir-buscador"') && hB.includes('data-accion="editar-vinculo"') &&
  hB.includes('data-accion="anular-vinculo"') && !hB.includes("Restaurar"));

// =========================================================================
console.log("== 2. T75 · nombres en vez del id ==");
// =========================================================================
assert("ccNombreVenta: cantidad, inmueble y fecha de la salida",
  ccNombreVenta(B, REGS) === "Venta de 3,5 tokens de Prueba Alcazaba 1 · 12/05/2026", ccNombreVenta(B, REGS));
assert("sin la salida en la sesión: el id (no se inventa)", ccNombreVenta(B, [C1]) === "pd_b");
// Sin la burbuja «Vínculo pd_…» (código técnico).
assert("«Resueltos» enseña el nombre y no el id",
  hB.includes('<b>Venta de 3,5 tokens de Prueba Alcazaba 1 · 12/05/2026</b>') && !hB.includes("Vínculo pd_b"), hB.slice(0, 220));
const ctx = ccContextoCandidatos(CACHE, { wallet: W, vault: V }, REGS);
const vSal = ccVinculoDeRegistro(S1, ctx), vPago = ccVinculoDeRegistro(C1, ctx);
assert("salida: «cobrada el <fecha del pago>»", ccDetalleVinculo(vSal, VENTAS, REGS) === "cobrada el 20/05/2026");
assert("pago: de qué venta es (inmueble y fecha)", ccDetalleVinculo(vPago, VENTAS, REGS) === "Prueba Alcazaba 1, 12/05/2026");
vPago.detalle = ccDetalleVinculo(vPago, VENTAS, REGS);
assert("distintivo del pago: «🔗 Cobro de una venta · Prueba Alcazaba 1, 12/05/2026» y el id solo en data-venta",
  ccTextoVinculada(vPago) === "🔗 Cobro de una venta · Prueba Alcazaba 1, 12/05/2026" &&
  ccHtmlTarjeta(C1, { vinculada: vPago }).includes('data-venta="pd_b"'));
assert("sin detalle: el id, como antes", ccTextoVinculada({ rol: "salida", ventaIds: ["pd_x"] }) === "🔗 Venta vinculada · pd_x");

// =========================================================================
console.log("== 3. T69 · el hash es el enlace, igual en toda la app ==");
// =========================================================================
const enl = ccEnlaceHash(C1.hash);
assert("enlace: «0x0005…abab ↗» a Polygonscan, con el hash entero en la ayuda",
  enl.includes('href="https://polygonscan.com/tx/' + C1.hash + '"') &&
  enl.includes(">" + C1.hash.slice(0, 6) + "…" + C1.hash.slice(-4) + " ↗</a>") && enl.includes('title="' + C1.hash));
assert("sin hash: «sin hash», sin enlace", ccEnlaceHash("").includes("sin hash") && !ccEnlaceHash("").includes("href"));
assert("card de Revisión: el hash es el enlace (sin «ver transacción» aparte)",
  ccHtmlTarjeta(S3, {}).includes('class="cc-hash-enlace mono"') && !ccHtmlTarjeta(S3, {}).includes("ver transacción"));
assert("fila del buscador: el hash es el enlace", ccHtmlFilaCobro(C4, false, S4).includes('class="cc-hash-enlace mono"'));
assert("«Resueltos»: la salida y el cobro con su hash como enlace",
  (hB.match(/cc-hash-enlace/g) || []).length === 2 && ccHtmlRegCorto(C1).includes("120 USDC · 20/05/2026 · <a"));
assert("formulario (tarjeta venta ↔ pago): el hash es el enlace",
  ccHtmlParColumna("VENTA", S1, null, null).includes('class="cc-hash-enlace mono cc-par-hash"'));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
