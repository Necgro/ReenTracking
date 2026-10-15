/* P15 (A): «En USDT…» en 💶 Coste de las compras bancarias. Una compra
 * pagada en USDT a una wallet de Reental y entregada después sale como
 * compra bancaria: lo pagado en USD y el día del pago se pasan a € con el
 * BCE de ese día y quedan como su coste.
 *
 * Bajo prueba (js/20):
 * - cbEurDeUsd / cbTextoEurDeUsd: USD ÷ tipo del BCE del día (o el último
 *   anterior, como el motor), a céntimos; los errores (coma, sin día, sin
 *   tipo) y nada mientras no hay nada escrito.
 * - cbHtmlFila / cbHtmlUsdt: «En USDT…» solo con la casilla abierta; la
 *   subfila con lo pagado, el día y el resultado.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_coste_usdt_paso_p15.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "07-bce.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js", "20-coste-compras.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
S.log = () => {};

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

console.log("== 1. El cálculo ==");
const tipos = { "2024-03-01": 1.1, "2024-03-04": 1.08 };
const C = (usd, fecha) => S.cbEurDeUsd(usd, fecha, tipos, null);
let r = C("1.000", "2024-03-01");
assert("1.000 USD el 01/03 con el BCE a 1,1 → 909,09 €", r.eur === 909.09 && r.fecha === "2024-03-01", r);
assert("el texto: «= 909,09 € (BCE del 01/03/2024)»", S.cbTextoEurDeUsd(r) === "= 909,09 € (BCE del 01/03/2024)", S.cbTextoEurDeUsd(r));
r = C("1.000", "2024-03-03");
assert("un domingo: el último tipo anterior (viernes 01/03)", r.eur === 909.09 && r.fecha === "2024-03-01", r);
r = C("540,5", "2024-03-04");
assert("con decimales y otro día: 540,5 / 1,08 = 500,46 €", r.eur === 500.46, r);
assert("vacío: nada que decir", JSON.stringify(C("  ", "2024-03-01")) === JSON.stringify({ error: "" }) && S.cbTextoEurDeUsd(C("", "2024-03-01")) === "");
assert("«1000.5»: pide la coma", C("1000.5", "2024-03-01").error === "Usa la coma para los decimales (1.234,56).", C("1000.5", "2024-03-01"));
assert("0: «Escribe un importe mayor que 0.»", C("0", "2024-03-01").error === "Escribe un importe mayor que 0.");
assert("sin día: «Pon el día del pago.»", C("1.000", "").error === "Pon el día del pago.");
assert("sin tipo del BCE para ese día (antes de todos)", C("1.000", "2023-01-01").error === "Sin tipo del BCE para ese día.");
assert("sin ningún tipo", S.cbEurDeUsd("1.000", "2024-03-01", {}, null).error === "Sin tipo del BCE para ese día.");
assert("auditoría F1: 0,004 USD (0,00 €) es un error, no un 0", C("0,004", "2024-03-01").error === "Escribe un importe mayor que 0." &&
  !("eur" in C("0,004", "2024-03-01")), C("0,004", "2024-03-01"));

console.log("== 2. La pantalla ==");
const INM = "0x" + "a1".repeat(20), W = "0x" + "11".repeat(20);
const reg = { clave: "c1", fecha: "2024-03-05 10:00:00", hash: "0x" + "ab".repeat(32), contrato: INM, simbolo: "RALC1", inmueble: "Prueba Alcazaba 1",
  cantidad: 9, categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", coste_eur: 900, origen: "0x" + "77".repeat(20), destino: W };
const [f] = S.cbFilas([reg], {}, 100);
assert("cerrada: sin «En USDT…»", !S.cbHtmlFila(f, {}).includes('data-cb="usdt"'));
const abierta = S.cbHtmlFila(f, { c1: "900,00" });
assert("abierta: «En USDT…» junto a Guardar y Cancelar, sin subfila", abierta.includes('data-cb="usdt"') && abierta.includes("En USDT…") &&
  !abierta.includes("cb-usdt"), abierta);
const conUsdt = S.cbHtmlFila(Object.assign({}, f, { usdt: { usd: "1.000", fecha: "2024-03-01", calc: C("1.000", "2024-03-01") } }), { c1: "909,09" });
assert("con «En USDT…» abierto: la subfila con lo pagado, el día y el resultado",
  conUsdt.includes('class="cb-usdt"') && conUsdt.includes('class="cb-usd" data-clave="c1" value="1.000"') &&
  conUsdt.includes('type="date" class="cb-usd-fecha" data-clave="c1" value="2024-03-01"') &&
  conUsdt.includes("= 909,09 € (BCE del 01/03/2024)") && conUsdt.includes('colspan="7"'), conUsdt);
assert("la subfila no sale si la casilla está cerrada", !S.cbHtmlFila(Object.assign({}, f, { usdt: { usd: "", fecha: "" } }), {}).includes("cb-usdt"));

console.log("== 3. «Actualizar» también baja el día de cada pago en USD ==");
vm.runInContext(fs.readFileSync(path.join(BASE, "22-informe-renta.js"), "utf8"), S, { filename: "22-informe-renta.js" });
const nec = S.fechasBceNecesarias({ transacciones: { wallet_tokens: [] }, ajustes_usuario: {
  a: { coste_eur: 1000, pagado_usd: 1080, fecha_pago_usd: "2023-06-15" }, b: { coste_eur: 5 }, c: { pagado_usd: 1, fecha_pago_usd: "2026-07-01" },
  d: { pagado_usd: 1, fecha_pago_usd: "15/06/2023" } } }, [], "2026-06-10");
assert("el día del pago entra (no los de hoy en adelante ni los mal escritos)", nec.includes("2023-06-15") && !nec.includes("2026-07-01") &&
  !nec.includes("15/06/2023") && nec.includes("2026-06-09"), nec);

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
