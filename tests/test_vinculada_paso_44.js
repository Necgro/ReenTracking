/* Test unitario de los pagos diferidos: distintivo «Vinculada» y salto a
 * los movimientos relacionados.
 *
 * Funciones bajo prueba:
 * - js/15 · ccTextoVinculada: «🔗 Venta vinculada · id» en la salida y
 *   «🔗 Cobro de una venta · id» en el cobro (un DEPOSITO vinculado se ve que
 *   es el pago de una venta).
 * - js/15 · ccHtmlTarjeta: el distintivo es un botón que lleva al vínculo.
 * - js/15 · ccHtmlVenta: cada movimiento del vínculo lleva su «Ver en
 *   Transacciones →»; si el movimiento no está en la sesión, no hay botón.
 * - js/18 · txHtmlFila: el mismo distintivo, como botón, en la tabla.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_vinculada_paso_44.js
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
                 "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
const { ccContextoCandidatos, ccVinculoDeRegistro, ccTextoVinculada, ccHtmlTarjeta, ccHtmlVenta,
        ccResumenVenta, ccReferenciaDeRegistro, txHtmlFila } = sandbox;
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
// Con la marca que pone el motor al aplicar el vínculo.
const SAL = reg("sal", P1, W, T, 40, "VENTA", { inmueble: "Prueba Alcazaba 1", hash: H(2), importe_usdt: 120,
  pago_diferido: { venta_id: "pd_prueba_001", rol: "salida" } });
const PAGO = reg("pago", USDC, T, W, 120, "DEPOSITO", { simbolo: "USDC", hash: H(3),
  pago_diferido: { venta_id: "pd_prueba_001", rol: "pago" } });
const LIBRE = reg("libre", USDC, T, W, 50, "DEPOSITO", { simbolo: "USDC", hash: H(4) });
const REGS = [SAL, PAGO, LIBRE];
const CACHE = {
  catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1" } },
  contratos_aprendidos: {},
  transacciones: { wallet_tokens: [], vault_tokens: [], wallet_normales: [], vault_normales: [] },
  pagos_diferidos: { version: 1, ventas: [] },
};
const VID = "pd_prueba_001";
const VENTA = {
  id: VID, estado: "CONFIRMADO", estado_liquidacion: "COMPLETA", creado: "2026-09-30T10:00:00",
  salida: ccReferenciaDeRegistro(SAL, CACHE),
  asignaciones: [{ id: "a1", pago: ccReferenciaDeRegistro(PAGO, CACHE), cantidad_asignada: 120 }],
};
CACHE.pagos_diferidos.ventas.push(VENTA);
const ctx = ccContextoCandidatos(CACHE, { wallet: W, vault: V }, REGS);
const vSal = ccVinculoDeRegistro(SAL, ctx), vPago = ccVinculoDeRegistro(PAGO, ctx);

// =========================================================================
console.log("== 1. Texto del distintivo ==");
// =========================================================================
assert("la fixture se resuelve: salida y pago con vínculo, el otro depósito sin él",
  vSal && vSal.rol === "salida" && vPago && vPago.rol === "pago" && ccVinculoDeRegistro(LIBRE, ctx) === null);
assert("salida: «🔗 Venta vinculada · id»", ccTextoVinculada(vSal) === "🔗 Venta vinculada · " + VID);
assert("cobro: «🔗 Cobro de una venta · id» (un depósito vinculado se ve que es un pago)",
  ccTextoVinculada(vPago) === "🔗 Cobro de una venta · " + VID);
assert("varios vínculos: todos los ids",
  ccTextoVinculada({ rol: "pago", ventaIds: ["a", "b"] }) === "🔗 Cobro de una venta · a · b" &&
  ccTextoVinculada(vSal, true) === "🔗 Venta vinculada" && ccTextoVinculada(vPago, true) === "🔗 Cobro de una venta");

// =========================================================================
console.log("== 2. Card de Revisión: el distintivo es un botón al vínculo ==");
// =========================================================================
const cardSal = ccHtmlTarjeta(SAL, { vinculada: vSal });
const cardPago = ccHtmlTarjeta(PAGO, { vinculada: vPago });
const botonCard = new RegExp('<button type="button" class="cc-vinculada" data-accion="ver-vinculo" data-venta="' + VID + '"');
assert("salida: botón «ver-vinculo» con el id y el texto de venta",
  botonCard.test(cardSal) && cardSal.includes("🔗 Venta vinculada · " + VID));
assert("cobro: botón «ver-vinculo» con el texto de pago",
  botonCard.test(cardPago) && cardPago.includes("🔗 Cobro de una venta · " + VID));
assert("registro sin vínculo: sin distintivo", !ccHtmlTarjeta(LIBRE, {}).includes("cc-vinculada"));

// =========================================================================
console.log("== 3. «Resueltos»: salto a cada movimiento ==");
// =========================================================================
const htmlVenta = ccHtmlVenta(VENTA, ccResumenVenta(VENTA, REGS));
const saltos = [...htmlVenta.matchAll(/data-accion="ver-movimiento" data-clave="([^"]+)"/g)].map(m => m[1]);
assert("un «Ver en Transacciones →» para la salida y otro para el cobro, con su clave",
  JSON.stringify(saltos) === JSON.stringify(["sal", "pago"]) && htmlVenta.includes("Ver en Transacciones →"), saltos);
const sinPago = ccHtmlVenta(VENTA, ccResumenVenta(VENTA, [SAL]));
assert("si un movimiento no está en la sesión, no hay botón para él (no se inventa)",
  [...sinPago.matchAll(/data-accion="ver-movimiento"/g)].length === 1 &&
  sinPago.includes("falta el movimiento"));
const ANUL = Object.assign({}, VENTA, { estado: "ANULADO", anulado: "2026-09-30T11:00:00" });
assert("un vínculo anulado conserva el salto a sus movimientos",
  [...ccHtmlVenta(ANUL, ccResumenVenta(ANUL, REGS)).matchAll(/data-accion="ver-movimiento"/g)].length === 2);

// =========================================================================
console.log("== 4. Tabla de Transacciones ==");
// =========================================================================
const filaSal = txHtmlFila(SAL, { estadoRevisar: "libre", vinculo: vSal });
const filaPago = txHtmlFila(PAGO, { estadoRevisar: "libre", vinculo: vPago });
/* El distintivo es un icono 🔗 con su burbuja. */
const botonFila = new RegExp('<button type="button" class="tx-accion tx-ico tx-vinculada" data-accion="ver-vinculo" data-venta="' + VID + '"');
assert("fila de la salida: botón «🔗 Venta vinculada» (el id, en la ayuda) y «➕ Otro cobro…»",
  botonFila.test(filaSal) && filaSal.includes("<b>Venta vinculada</b>") && filaSal.includes("<b>Otro cobro…</b>"));
assert("fila del cobro: botón «🔗 Cobro de una venta», sin ➕",
  botonFila.test(filaPago) && filaPago.includes("<b>Cobro de una venta</b>") && !filaPago.includes("➕"));
assert("la categoría del cobro NO cambia (sigue Depósito: el lote se abre desde el cobro)",
  PAGO.categoria === "DEPOSITO" && filaPago.includes('data-clave="pago"'));
assert("fila sin vínculo: sin distintivo",
  !txHtmlFila(LIBRE, { estadoRevisar: "libre" }).includes("tx-vinculada"));
assert("ya no queda la marca antigua sin botón",
  !filaSal.includes('<span class="tx-vinculada"') && !cardSal.includes('<span class="cc-vinculada"'));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
