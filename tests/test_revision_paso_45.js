/* Test de 🔍 Revisión: botones de decisión con «Sugerida» en cada tarjeta
 * a revisar; solo los que encajan.
 *
 * Bajo prueba (Reental-SPA/js/15-correcciones.js):
 * - ccOpcionesDecision: «✔ Dejar como …» (Sugerida) y solo las alternativas
 *   que encajan con el movimiento.
 * - ccAjustesConDecision / ccAjusteDecision: el ajuste de cada decisión
 *   (la compra bancaria con via_compra BANCARIA, para que el cálculo
 *   fiscal use su coste en €), que sustituye un ajuste que solo pedía
 *   revisión y nunca pisa uno ajeno.
 * - ccAjustesSinDecision: deshacer devuelve los ajustes de antes (también
 *   el «Mandado a revisar» o el «Sacado del spam» que sustituyó).
 * - aplicarAjustesUsuario (js/14): con la decisión, el registro deja de
 *   estar a revisar; deshecha, vuelve exactamente a lo de antes.
 * - «🚫 Es spam» es el mismo ajuste que el 🚫 de 📒 Transacciones (su ↩
 *   lo deshace allí).
 * - ccDecisionesTomadas / ccResumenDecision / ccEurOrientativo /
 *   ccHtmlDecisiones.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_revision_paso_45.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "07-bce.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
S.log = () => {};

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const W = "0x" + "11".repeat(20), T = "0x" + "77".repeat(20), INM = "0x" + "a1".repeat(20);
const USDT = vm.runInContext("USDT", S);
const ctx = { propias: new Set([W]), inmuebles: new Set([INM]) };
function reg(clave, categoria, extra = {}) {
  return Object.assign({ clave, fecha: "2026-06-14 10:00:00", hash: "0x" + "ab".repeat(32), contrato: USDT, token: "USDT0",
    simbolo: "USDT0", cantidad: 18.54, categoria, subcategoria: "X", inmueble: null, importe_usdt: 18.54, coste_eur: null,
    origen: T, destino: W, fuente: "ONCHAIN", nota: "nota del motor", revisar: true }, extra);
}
const ids = r => S.ccOpcionesDecision(r, ctx).map(o => o.id + (o.sugerida ? "*" : ""));
const FECHA = "2026-10-01T10:00:00.000Z";

console.log("== 1. Solo los que encajan ==");
assert("depósito de USDT: Dejar como Depósito (Sugerida), Neutro y Spam",
  JSON.stringify(ids(reg("d", "DEPOSITO"))) === JSON.stringify(["dejar*", "neutro", "spam"]), ids(reg("d", "DEPOSITO")));
assert("la etiqueta: «✔ Dejar como Depósito»", S.ccOpcionesDecision(reg("d", "DEPOSITO"), ctx)[0].etiqueta === "✔ Dejar como Depósito");
const rarUsdt = reg("r", "REVISAR");
assert("USDT que entra sin regla (REVISAR): Dinero que recibí, Neutro y Spam (sin Sugerida)",
  JSON.stringify(ids(rarUsdt)) === JSON.stringify(["dinero", "neutro", "spam"]), ids(rarUsdt));
const salidaInm = reg("s", "REVISAR", { contrato: INM, inmueble: "Cáceres 8", simbolo: "RCAC8", origen: W, destino: T, importe_usdt: null });
assert("salida de un inmueble: Es una venta, Neutro y Spam",
  JSON.stringify(ids(salidaInm)) === JSON.stringify(["venta", "neutro", "spam"]), ids(salidaInm));
const ventaSinPrecio = Object.assign({}, salidaInm, { categoria: "VENTA" });
assert("venta sin precio: no se ofrece «Dejar»; «Es una venta…» es la Sugerida",
  JSON.stringify(ids(ventaSinPrecio)) === JSON.stringify(["venta*", "neutro", "spam"]), ids(ventaSinPrecio));
const entradaInm = reg("e", "REVISAR", { contrato: INM, inmueble: "Cáceres 8", simbolo: "RCAC8", importe_usdt: null });
assert("entrada de un inmueble: Compra bancaria, Neutro y Spam",
  JSON.stringify(ids(entradaInm)) === JSON.stringify(["compra", "neutro", "spam"]), ids(entradaInm));
const rend = reg("rd", "RENDIMIENTO", { fuente: "CSV_REENTAL" });
assert("rendimiento del archivo: Dejar como Rendimiento y Neutro (sin spam: no es de la blockchain)",
  JSON.stringify(ids(rend)) === JSON.stringify(["dejar*", "neutro"]), ids(rend));
assert("movimiento neutro: no repite «Movimiento neutro»", !ids(reg("m", "MOVIMIENTO")).includes("neutro"));

console.log("== 2. Los ajustes de cada decisión ==");
const aj = (r, id, v, previos) => S.ccAjustesConDecision(previos || {}, r, id, v, FECHA)[r.clave];
assert("dejar: solo revisar:false y la marca", JSON.stringify(aj(reg("d", "DEPOSITO"), "dejar")) ===
  JSON.stringify({ revisar: false, nota: "Decidido por ti en Revisión (2026-10-01): se deja como depósito" }), aj(reg("d", "DEPOSITO"), "dejar"));
const venta = aj(salidaInm, "venta", "1.234,5");
assert("venta: VENTA/GPP_INMUEBLE con el importe (escrito a la española)",
  venta.categoria === "VENTA" && venta.subcategoria === "GPP_INMUEBLE" && venta.importe_usdt === 1234.5 && venta.revisar === false, venta);
assert("importe del campo numérico («1234.5») también vale", aj(salidaInm, "venta", "1234.5").importe_usdt === 1234.5);
const compra = aj(entradaInm, "compra", "3000");
assert("compra bancaria: COMPRA/COSTE_BASE, via_compra BANCARIA y coste_eur",
  compra.categoria === "COMPRA" && compra.via_compra === "BANCARIA" && compra.coste_eur === 3000, compra);
assert("dinero recibido: DEPOSITO/COSTE_BASE con importe_usdt", aj(rarUsdt, "dinero", "18,54").importe_usdt === 18.54);
assert("neutro: MOVIMIENTO/NEUTRO", aj(rarUsdt, "neutro").categoria === "MOVIMIENTO");
let lanzo = false;
try { aj(salidaInm, "venta", ""); } catch (e) { lanzo = /importe/.test(e.message); }
assert("sin importe no se guarda", lanzo);
const spam = aj(rarUsdt, "spam");
assert("🚫 Es spam: el ajuste del 🚫 de Transacciones (js/18 lo reconoce y su ↩ lo quita)",
  spam.categoria === "SPAM" && S.txEsAjusteMandarSpam(spam) &&
  S.txEstadoSpam(Object.assign({}, rarUsdt, { categoria: "SPAM" }), { r: spam }) === "quitar", spam);

console.log("== 3. Sustituir y deshacer ==");
const mandado = { r: { revisar: true, nota: "Mandado a revisar por ti (2026-09-30): comprobar" } };
const conDec = S.ccAjustesConDecision(mandado, rarUsdt, "neutro", null, FECHA);
assert("sustituye el «Mandado a revisar» y lo recuerda en la nota", Object.keys(conDec).length === 1 &&
  conDec.r.nota.includes("[antes: mandado a revisar (2026-09-30): comprobar]"), conDec); // con fecha y motivo
const vuelta = S.ccAjustesSinDecision(conDec, "r", FECHA);
assert("deshacer lo devuelve a revisar (con la marca de js/18, que lo reconoce)",
  vuelta.r.revisar === true && S.txEsAjusteMandarRevisar(vuelta.r), vuelta);
const sacado = { r: { categoria: "REVISAR", subcategoria: "PENDIENTE", revisar: true, nota: "Sacado del spam por ti (2026-09-30)" } };
const vuelta2 = S.ccAjustesSinDecision(S.ccAjustesConDecision(sacado, rarUsdt, "dinero", "5", FECHA), "r", FECHA);
assert("deshacer una decisión sobre algo sacado del spam: vuelve a «sacado del spam»", S.txEsAjusteSacarSpam(vuelta2.r), vuelta2);
const otra = { x: { coste_eur: 1 } };
assert("deshacer sin nada previo: los ajustes como antes",
  JSON.stringify(S.ccAjustesSinDecision(S.ccAjustesConDecision(otra, rarUsdt, "neutro", null, FECHA), "r", FECHA)) === JSON.stringify(otra));
lanzo = false;
try { S.ccAjustesConDecision({ r: { coste_eur: 5, nota: "desde el panel" } }, rarUsdt, "neutro", null, FECHA); } catch (e) { lanzo = true; }
assert("nunca pisa un ajuste ajeno", lanzo);
assert("con un ajuste ajeno, la tarjeta no ofrece botones",
  S.ccEstadoDecision(rarUsdt, { r: { coste_eur: 5 } }) === "ajeno" &&
  /Ajustes en JSON/.test(S.ccHtmlDecisiones(rarUsdt, { estado: "ajeno", opciones: [] })));
lanzo = false;
try { S.ccAjustesSinDecision({ r: { coste_eur: 5 } }, "r", FECHA); } catch (e) { lanzo = true; }
assert("deshacer nunca borra un ajuste ajeno", lanzo);

console.log("== 3b. Marcas antiguas («desde la SPA», hasta el 01/10/2026) ==");
const viejoMandado = { r: { revisar: true, nota: "Mandado a revisar desde la SPA (2026-10-01)" } };
assert("un «Mandado a revisar desde la SPA» se sigue sustituyendo y devolviendo",
  S.ccEstadoDecision(rarUsdt, viejoMandado) === "propio" &&
  S.ccAjustesConDecision(viejoMandado, rarUsdt, "neutro", null, FECHA).r.nota.includes("[antes: mandado a revisar (2026-10-01)]"));
const viejaDecision = { r: { revisar: false, nota: "Decidido en Revision desde la SPA (2026-10-01): movimiento neutro" } };
assert("una decisión antigua sale en Resueltos y se puede deshacer",
  S.ccEsAjusteDecision(viejaDecision.r) && JSON.stringify(S.ccAjustesSinDecision(viejaDecision, "r", FECHA)) === "{}");
const viejoSpam = { categoria: "SPAM", subcategoria: "NEUTRO", revisar: false, nota: "Mandado al spam desde la SPA (2026-10-01) en Revision" };
assert("un «Es spam» antiguo de Revisión también", S.ccEsAjusteDecision(viejoSpam) && S.txEsAjusteMandarSpam(viejoSpam));
assert("las marcas nuevas no dicen «SPA»", !/la SPA/.test(JSON.stringify(S.ccAjustesConDecision({}, rarUsdt, "spam", null, FECHA))));

console.log("== 4. Los motores lo aplican ==");
const original = JSON.stringify([rarUsdt]);
const aplicar = a => { const c = JSON.parse(original); S.aplicarAjustesUsuario(c, { ajustes_usuario: a }); return c[0]; };
const dec = S.ccAjustesConDecision({}, rarUsdt, "dinero", "18,54", FECHA);
const r1 = aplicar(dec);
assert("con la decisión: DEPOSITO y ya no a revisar", r1.categoria === "DEPOSITO" && r1.revisar === false, r1);
assert("deshecha: exactamente lo de antes", JSON.stringify([aplicar(S.ccAjustesSinDecision(dec, "r", FECHA))]) === original);

console.log("== 5. Resueltos, resumen, ≈ € y HTML ==");
const tomadas = S.ccDecisionesTomadas(Object.assign({}, dec, otra, { s: spam }), [rarUsdt, Object.assign({}, rarUsdt, { clave: "s" })]);
assert("Resueltos: las decisiones con registro (también el spam de Revisión), no los ajustes ajenos",
  tomadas.length === 2 && tomadas.every(t => t.reg), tomadas.map(t => t.clave));
assert("el 🚫 de Transacciones no sale en Resueltos de Revisión",
  S.ccDecisionesTomadas({ r: S.txAjustesConSpam({}, "r", "spam", FECHA).r }, [rarUsdt]).length === 0);
assert("resumen: «Venta · 1.234,50 USD»", S.ccResumenDecision(venta) === "Venta · 1.234,50 USD", S.ccResumenDecision(venta));
assert("resumen: «Compra bancaria · 3.000,00 €»", S.ccResumenDecision(compra) === "Compra bancaria · 3.000,00 €");
// «Dejar como…» nombra la categoría del movimiento (sin ella, el texto genérico).
assert("resumen: «Se deja como Compra»", S.ccResumenDecision({ revisar: false }, { categoria: "COMPRA" }) === "Se deja como Compra" &&
  S.ccResumenDecision({ revisar: false }) === "Se deja como lo dice la app");
const eur = S.ccEurOrientativo(115, "2026-06-14 10:00:00", { "2026-06-12": 1.15, "2026-06-15": 1.2 });
assert("≈ €: con el tipo BCE del día o el último anterior", eur && Math.abs(eur.eur - 100) < 1e-9 && eur.fecha === "2026-06-12", eur);
assert("≈ €: sin tipos, nada", S.ccEurOrientativo(115, "2026-06-14", {}) === null);
const html = S.ccHtmlDecisiones(salidaInm, { estado: "libre", opciones: S.ccOpcionesDecision(ventaSinPrecio, ctx),
  abierta: { id: "venta", valor: "1.150" }, eur: { eur: 1000, fecha: "2026-06-12" } });
assert("HTML: la Sugerida con su etiqueta, el formulario con «Cobrado … USD» y el ≈ €",
  /cc-dec sugerida abierta[^>]*data-opcion="venta"/.test(html) && /<span class="cc-sugerida">Sugerida<\/span>/.test(html) &&
  /Cobrado <input[^>]*value="1\.150"/.test(html) && /≈ 1\.000,00 € \(BCE del 12\/06\/2026\)/.test(html), html);

console.log("");
console.log(ok + "/" + (ok + fallos) + " comprobaciones OK -> " + (fallos ? "HAY FALLOS" : "TODO VERDE"));
process.exit(fallos ? 1 : 0);
