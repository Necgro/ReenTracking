/* Test unitario de 🚫 «Mandar al spam» y ↩ «Quitar del spam» en
 * 📒 Transacciones.
 *
 * Funciones bajo prueba (Reental-SPA/js/18-transacciones.js):
 * - txEstadoSpam: qué icono lleva cada fila (en qué categorías sale 🚫,
 *   ↩ en el spam, nada en lo de Reental ni en lo vinculado).
 * - txAjustesConSpam / txAjustesSinSpam: el ajuste que se guarda, sin
 *   pisar ni borrar nada ajeno, y que deshacer deja los ajustes como antes.
 * - aplicarAjustesUsuario (js/14): con ese ajuste, el movimiento pasa al
 *   spam (o queda a revisar) y al quitarlo vuelve exactamente a lo de antes.
 * - txHtmlFila: iconos y marca ↩ «Sacado del spam»; sin 🔍 en el spam.
 * - txMotivoSpam: lo mandado por ti sale como «Mandado al spam por ti».
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_apartar1.js
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
S.log = () => {}; // el registro técnico de js/02 necesita el DOM

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
function reg(clave, categoria, subcategoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-08-31 10:00:00", hash: "0x" + "ef".repeat(32), contrato: "0x" + "a1".repeat(20), token: "USDT0", simbolo: "USDT0",
    cantidad: 0.00001, categoria, subcategoria, inmueble: null, importe_usdt: 0.00001, coste_eur: null,
    origen: "", destino: "", fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}
const FECHA = "2026-10-01T10:00:00.000Z";

console.log("== 1. Dónde sale cada icono ==");
for (const cat of ["DEPOSITO", "MOVIMIENTO", "REWARD", "RETIRADA", "REVISAR"]) {
  assert("🚫 en " + cat, S.txEstadoSpam(reg("k", cat, "X"), {}) === "mandar");
}
for (const cat of ["RENDIMIENTO", "COMPRA", "VENTA", "COMISION"]) {
  assert("nada en " + cat + "", S.txEstadoSpam(reg("k", cat, "X"), {}) === "");
}
assert("nada en una salida por vincular", S.txEstadoSpam(reg("k", "REVISAR", "PENDIENTE"), {}, { pendiente: "salida" }) === "");
assert("nada en un movimiento vinculado", S.txEstadoSpam(reg("k", "DEPOSITO", "COSTE_BASE"), {}, { vinculo: { rol: "pago" } }) === "");
assert("nada si ya tiene un ajuste (p. ej. mandado a revisar)",
  S.txEstadoSpam(reg("k", "DEPOSITO", "COSTE_BASE"), { k: { revisar: true, nota: "Mandado a revisar por ti (2026-10-01)" } }) === "");
assert("spam de la app: ↩ (sacar)", S.txEstadoSpam(reg("k", "SPAM", "NEUTRO"), {}) === "sacar");
assert("spam con un ajuste de otro origen: ↩ inactivo",
  S.txEstadoSpam(reg("k", "SPAM", "NEUTRO"), { K: { categoria: "SPAM", nota: "desde el panel" } }) === "ajeno");

console.log("== 2. Mandar al spam y quitarlo ==");
const ajustesAntes = { otra: { coste_eur: 12 } };
const conSpam = S.txAjustesConSpam(ajustesAntes, " K ", "spam", FECHA);
assert("no muta los ajustes recibidos", Object.keys(ajustesAntes).length === 1);
assert("ajuste con la clave normalizada y su marca",
  JSON.stringify(conSpam.k) === JSON.stringify({ categoria: "SPAM", subcategoria: "NEUTRO", revisar: false, nota: "Mandado al spam por ti (2026-10-01)" }), conSpam.k);
const r1 = reg("k", "DEPOSITO", "COSTE_BASE");
assert("tras mandarlo: ↩ (quitar)", S.txEstadoSpam(Object.assign({}, r1, { categoria: "SPAM" }), conSpam) === "quitar");
const sinSpam = S.txAjustesSinSpam(conSpam, "k");
assert("quitar deja los ajustes como antes", JSON.stringify(sinSpam) === JSON.stringify(ajustesAntes), sinSpam);
let lanzo = false;
try { S.txAjustesConSpam(conSpam, "k", "spam", FECHA); } catch (e) { lanzo = true; }
assert("no pisa un ajuste que ya existe", lanzo);
lanzo = false;
try { S.txAjustesSinSpam({ k: { categoria: "SPAM", nota: "desde el panel" } }, "k"); } catch (e) { lanzo = true; }
assert("no borra un ajuste ajeno", lanzo);
lanzo = false;
try { S.txAjustesSinSpam({ k: { categoria: "SPAM", subcategoria: "NEUTRO", revisar: false, nota: "Mandado al spam por ti (x)", coste_eur: 3 } }, "k"); } catch (e) { lanzo = true; }
assert("un ajuste con la marca pero con más campos tampoco se borra", lanzo);

console.log("== 3. Sacar del spam y devolverlo ==");
const sacado = S.txAjustesConSpam({}, "s", "sacar", FECHA);
assert("ajuste de sacar: a revisar, con su marca",
  JSON.stringify(sacado.s) === JSON.stringify({ categoria: "REVISAR", subcategoria: "PENDIENTE", revisar: true, nota: "Sacado del spam por ti (2026-10-01)" }), sacado.s);
const rs = reg("s", "REVISAR", "PENDIENTE", { revisar: true });
assert("tras sacarlo: 🚫 (devolver)", S.txEstadoSpam(rs, sacado) === "devolver");
assert("devolver lo borra", JSON.stringify(S.txAjustesSinSpam(sacado, "s")) === "{}");

console.log("== 4. Los motores lo aplican y deshacer devuelve lo de antes ==");
const huella = rs => JSON.stringify(rs);
const base = [reg("k", "DEPOSITO", "COSTE_BASE", { nota: "nota del motor" }), reg("s", "SPAM", "NEUTRO")];
const original = huella(base);
const aplicar = ajustes => { const copia = JSON.parse(original); S.aplicarAjustesUsuario(copia, { ajustes_usuario: ajustes }); return copia; };
const a1 = aplicar(conSpam);
assert("con el ajuste, el depósito es spam y no a revisar", a1[0].categoria === "SPAM" && a1[0].subcategoria === "NEUTRO" && a1[0].revisar === false, a1[0]);
assert("la nota del motor se conserva y se le añade la marca", a1[0].nota === "nota del motor; Mandado al spam por ti (2026-10-01)", a1[0].nota);
assert("su motivo: «Mandado al spam por ti»",
  S.txEtiquetaMotivoSpam(S.txMotivoSpam(a1[0], S.txContextoSpam({ ajustes_usuario: conSpam }))) === "Mandado al spam por ti");
assert("quitado el ajuste, todo como antes", huella(aplicar(sinSpam)) === original);
const a2 = aplicar(sacado);
assert("sacado: a revisar", a2[1].categoria === "REVISAR" && a2[1].revisar === true, a2[1]);
assert("devuelto: todo como antes", huella(aplicar({})) === original);

console.log("== 5. La fila ==");
const filaNormal = S.txHtmlFila(reg("k", "DEPOSITO", "COSTE_BASE"), { estadoRevisar: "libre", estadoSpam: "mandar" });
assert("fila normal: ✏️, 🔍 y 🚫", /data-accion="nota"/.test(filaNormal) && /data-accion="mandar-revisar"/.test(filaNormal) &&
  /data-accion="mandar-spam"/.test(filaNormal) && /<b>Mandar al spam<\/b>/.test(filaNormal));
const filaSpam = S.txHtmlFila(reg("s", "SPAM", "NEUTRO"), { estadoRevisar: "libre", estadoSpam: "sacar" });
assert("fila de spam: ✏️ y ↩, sin 🔍", /data-accion="sacar-spam"/.test(filaSpam) && !/mandar-revisar/.test(filaSpam) &&
  /<b>Quitar del spam<\/b>/.test(filaSpam));
const filaMandada = S.txHtmlFila(reg("k", "SPAM", "NEUTRO"), { estadoRevisar: "ajeno", estadoSpam: "quitar" });
assert("lo mandado por ti: ↩ que borra el ajuste, sin el 🔍 inactivo",
  /data-accion="quitar-ajuste-spam"/.test(filaMandada) && !/Ya tiene un ajuste/.test(filaMandada));
const filaSacada = S.txHtmlFila(rs, { estadoRevisar: "motor", estadoSpam: "devolver" });
assert("lo sacado: marca ↩ «Sacado del spam» en vez de la 🔍", /tx-marca-sacado/.test(filaSacada) &&
  /Sacado del spam<\/span>/.test(filaSacada) && !/tx-marca-rev/.test(filaSacada));
assert("lo sacado: 🚫 «Devolver al spam»", /data-accion="quitar-ajuste-spam"/.test(filaSacada) && /<b>Devolver al spam<\/b>/.test(filaSacada));
assert("en una compra, sin 🚫", !/spam"/.test(S.txHtmlFila(reg("c", "COMPRA", "COSTE_BASE"), { estadoRevisar: "libre", estadoSpam: "" })));

console.log("== 5b. Marcas antiguas («desde la SPA», hasta el 01/10/2026) ==");
const viejoSpam = { categoria: "SPAM", subcategoria: "NEUTRO", revisar: false, nota: "Mandado al spam desde la SPA (2026-10-01)" };
const viejoSacado = { categoria: "REVISAR", subcategoria: "PENDIENTE", revisar: true, nota: "Sacado del spam desde la SPA (2026-10-01)" };
const viejoRevisar = { revisar: true, nota: "Mandado a revisar desde la SPA (2026-10-01): x" };
assert("lo guardado con la marca antigua se sigue reconociendo y deshaciendo",
  S.txEstadoSpam(reg("k", "SPAM", "NEUTRO"), { k: viejoSpam }) === "quitar" &&
  S.txEstadoSpam(reg("k", "REVISAR", "PENDIENTE", { revisar: true }), { k: viejoSacado }) === "devolver" &&
  S.txEstadoRevisar(reg("k", "DEPOSITO", "COSTE_BASE"), { k: viejoRevisar }) === "spa" &&
  JSON.stringify(S.txAjustesSinSpam({ k: viejoSpam }, "k")) === "{}");
assert("las marcas nuevas no dicen «SPA»", !/la SPA/.test(JSON.stringify(S.txAjustesConSpam({}, "k", "spam", FECHA)) +
  S.txNotaMandarRevisar("", FECHA)));

console.log("== 6. Retoque: marca 🚫 y filtro por motivo ==");
assert("lo mandado por ti lleva la marca 🚫 «Mandado al spam por ti»",
  /tx-marca-spam[^>]*>🚫<span class="tx-burbuja" aria-hidden="true">Mandado al spam por ti<\/span>/.test(filaMandada), filaMandada);
assert("el spam de la app no la lleva", !/tx-marca-spam/.test(filaSpam));
const ctxF = S.txContextoSpam({ ajustes_usuario: conSpam });
const mio = Object.assign(reg("k", "SPAM", "NEUTRO"), {}), web = reg("w", "SPAM", "NEUTRO", { token: "Visit www.premio.example" });
const fMotivo = { categoria: "SPAM", ocultarSpam: true, motivo: "ajuste", ctxSpam: ctxF };
assert("con el motivo «ajuste» pulsado, solo pasa lo tuyo",
  S.txPasaFiltros(mio, fMotivo) && !S.txPasaFiltros(web, fMotivo));
assert("sin motivo pulsado, pasan los dos", S.txPasaFiltros(mio, Object.assign({}, fMotivo, { motivo: "" })) &&
  S.txPasaFiltros(web, Object.assign({}, fMotivo, { motivo: "" })));
assert("los recuentos de los motivos no dependen del motivo pulsado",
  S.txPasaFiltros(web, fMotivo, "motivo"));

console.log("");
console.log(ok + "/" + (ok + fallos) + " comprobaciones OK -> " + (fallos ? "HAY FALLOS" : "TODO VERDE"));
process.exit(fallos ? 1 : 0);
