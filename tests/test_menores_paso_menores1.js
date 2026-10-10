/* Test de arreglos menores que se ven usando la app. Una sección por arreglo; lo de pantalla (foco, arranque
 * sin almacenamiento, 📒 una sola vez) va en tests/navegador/verifymenores1.js.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_menores_paso_menores1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "07-bce.js", "14-clasificador.js", "15-correcciones.js",
                 "16-dashboard.js", "18-transacciones.js", "20-coste-compras.js", "21-fiscal.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
vm.runInContext("log = function () {}; toast = function () {};", S);
const fuente = f => fs.readFileSync(path.join(BASE, f), "utf8");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

console.log("== «-0,00» (§C) ==");
assert("dashNum(-0,001) = 0,00", S.dashNum(-0.001) === "0,00", S.dashNum(-0.001));
assert("dashNum(-0,004, 2) = 0,00 y -0,005 sigue negativo", S.dashNum(-0.004) === "0,00" && S.dashNum(-1.5) === "-1,50", S.dashNum(-1.5));
assert("dashNum(-0) = 0,00", S.dashNum(-0) === "0,00");

console.log("== Fecha de las notas en hora local (§C) ==");
// 00:30 en España (UTC+2) es el día de antes en UTC.
const d = { getTime: () => Date.parse("2026-10-07T22:30:00Z"), getTimezoneOffset: () => -120 };
assert("a las 00:30 de España pone el día de hoy", S.ahoraLocalISO(d) === "2026-10-08T00:30:00", S.ahoraLocalISO(d));
for (const f of ["15-correcciones.js", "18-transacciones.js", "20-coste-compras.js"]) {
  assert(f + ": nada escrito por el usuario con toISOString", !/new Date\(\)\.toISOString\(\)/.test(fuente(f)));
}

console.log("== «≈ €» con el tope de 4 días del BCE (§B12 A11) ==");
const tipos = { "2026-01-02": 1.1 };
assert("con un tipo de hace 4 días, sí", !!S.ccEurOrientativo(110, "2026-01-06 10:00:00", tipos));
assert("con uno de hace 5 días, no", S.ccEurOrientativo(110, "2026-01-07 10:00:00", tipos) === null);
assert("con uno de hace meses, no", S.ccEurOrientativo(110, "2026-06-01", tipos) === null);
const cubierta = { bce_cobertura: { fin: "2026-01-06" } };
assert("A4: el día después de lo cubierto, uno más (como el motor)", !!S.ccEurOrientativo(110, "2026-01-07", tipos, cubierta));
assert("y no dos más", S.ccEurOrientativo(110, "2026-01-08", tipos, cubierta) === null);
assert("una clave que no es fecha no se usa", S.ccEurOrientativo(110, "2026-06-01", { "2020": 1.1 }) === null);
assert("el del día, el mismo importe", Math.abs(S.ccEurOrientativo(110, "2026-01-02", tipos).eur - 100) < 1e-9);

console.log("== 💶 volver al precio por defecto en una compra decidida (§B3 A3) ==");
const compra = (clave, extra) => Object.assign({ clave, fecha: "2026-01-02 10:00:00", hash: "0x" + clave.padEnd(64, "0"),
  cantidad: 5, categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", inmueble: "X",
  coste_eur: 500, nota: "", revisar: false }, extra);
const R = compra("r");
const mandada = { r: { revisar: true, nota: "Mandado a revisar por ti (2026-01-01)", coste_eur: 600 } };
const a1 = S.cbAjustesConCostes(mandada, [{ clave: "r", valor: 500 }], [R], 100, "2026-01-03T10:00:00");
// El de por defecto se guarda como tuyo.
assert("mandada a revisar: volver a 100 €/token lo guarda como tuyo", a1.r.coste_eur === 500 && a1.r.revisar === true, a1);
const a2 = S.cbAjustesConCostes(mandada, [{ clave: "r", valor: 700 }], [R], 100, "2026-01-03T10:00:00");
assert("y otro coste sí se pone", a2.r.coste_eur === 700, a2);
// Mandada con 600 → «Dejar como» → 💶 a 500 (por defecto) → deshacer.
const Rv = Object.assign({}, R, { revisar: true });
const decidida = S.ccAjustesConDecision(mandada, Rv, "dejar", null, "2026-01-02T10:00:00");
const a3 = S.cbAjustesConCostes(decidida, [{ clave: "r", valor: 500 }], [R], 100, "2026-01-03T10:00:00");
const deshecha = S.ccAjustesSinDecision(a3, "r", "2026-01-04T10:00:00");
assert("deshacer tras volver al de por defecto deja 500, no el 600 de antes", deshecha.r && deshecha.r.coste_eur === 500, deshecha);
const sinPrevio = S.ccAjustesConDecision({}, Rv, "dejar", null, "2026-01-02T10:00:00");
const a4 = S.cbAjustesConCostes(S.cbAjustesConCostes(sinPrevio, [{ clave: "r", valor: 700 }], [R], 100, "x"),
  [{ clave: "r", valor: 500 }], [R], 100, "x");
assert("sin coste de antes, volver al de por defecto lo guarda (SUPUESTO-1 A1)", a4.r.coste_eur === 500, a4);

console.log("== 💶 la fila enseña el coste guardado aunque no se reclasifique (§B3 A8) ==");
const propio = S.cbAjustesConCostes({}, [{ clave: "r", valor: 650 }], [R], 100, "2026-01-03T10:00:00");
const fila = S.cbFilas([R], propio)[0];
assert("el coste visto es el del ajuste, no el del registro viejo", fila.coste === 650, fila.coste);
assert("y lo enseña", S.cbHtmlEditor([fila], {}).includes("650,00 €"));
assert("escribir lo guardado no es un cambio", S.cbCambios([R], propio, { r: "650" }, "r").length === 0);
// Coste propio 650 en el registro, se vuelve a 500 y no se reclasifica.
const Rviejo = compra("r", { coste_eur: 650 });
const filaVuelta = S.cbFilas([Rviejo], {}, 100)[0];
assert("A5: sin ajuste, la fila enseña el de por defecto (500), no el viejo del registro", filaVuelta.coste === 500, filaVuelta.coste);
assert("A5: y escribir 500 lo confirma como tuyo (SUPUESTO-1 A1)", S.cbCambios([Rviejo], {}, { r: "500" }, "r", 100).length === 1);
assert("un ajuste de otro origen sin coste sigue con el del registro",
  S.cbFilas([Rviejo], { r: { categoria: "COMPRA", nota: "a mano" } }, 100)[0].coste === 650);
// Un coste tuyo igual al de por defecto no se quita escribiéndolo (es tuyo: el informe no lo marca).
const sobrante = { r: S.ccAjusteCoste(500, "2026-01-01T10:00:00") };
const cambioSobra = S.cbCambios([R], sobrante, { r: "500" }, "r", 100);
assert("A6: escribir el de por defecto en un coste tuyo igual no es un cambio", cambioSobra.length === 0, cambioSobra);

console.log("== Ajustes en JSON: el orden no cuenta (§B3 A10) ==");
const pn = fuente("11-panel.js");
const ini = pn.indexOf("function pnMismoJson");
vm.runInContext(pn.slice(ini).split(/\r?\n\}\r?\n/)[0] + "\n}", S);
assert("mismo contenido, otro orden: iguales", S.pnMismoJson('{"a":1,"b":{"x":1,"y":2}}', '{"b":{"y":2,"x":1},"a":1}'));
assert("otro valor: distintos", !S.pnMismoJson('{"a":1}', '{"a":2}'));
assert("las listas sí miran el orden", !S.pnMismoJson('{"a":[1,2]}', '{"a":[2,1]}'));
assert("texto roto: distintos", !S.pnMismoJson('{"a":', '{"a":1}'));

console.log("== «N DeFi» cuenta el spam a revisar, como la tabla (§B18 A8) ==");
const DEFI = "0x" + "d".repeat(40);
const defi = { dirs: new Set([DEFI]), hashes: new Set() };
const spamRevisar = { clave: "s", categoria: "SPAM", revisar: true, origen: DEFI };
const spam = { clave: "t", categoria: "SPAM", revisar: false, origen: DEFI };
const res = S.txResumenTriaje([spamRevisar, spam], null, defi);
assert("cuenta el spam a revisar y no el otro", res.defi === 1, res);
const filas = S.txFiltrar([spamRevisar, spam], { ocultarSpam: true, defi }).map(r => r.clave);
assert("A3: con «DeFi» pulsado, la tabla enseña las mismas (el spam a revisar)", JSON.stringify(filas) === '["s"]', filas);
assert("sin «DeFi», el spam a revisar sigue oculto", S.txFiltrar([spamRevisar], { ocultarSpam: true }).length === 0);

console.log("== Vínculos: el motivo en llano (§B3 R6b) ==");
const llanos = [
  "venta pd_001: la salida ya esta vinculada a 'pd_002' (marcador pago_diferido en el registro k)",
  "venta pd_001, asignacion as_001: pago no encontrado entre los registros (hash 0xabc...)",
  "sobreasignacion: pago k suma asignada 2.000000 > cantidad recibida 1.000000 (ventas: pd_001)",
  "venta pd_001, asignacion as_001: cantidad_asignada '50' invalida (debe ser numerica > 0)",
].map(S.ccProblemaEnLlano);
assert("sin «venta pd_», «asignacion» ni «(ventas:»", llanos.every(t => !/pd_|asignacion|\(ventas:/.test(t)), llanos);
const conflicto = "conflicto: el ajuste de usuario sobre 's1' modifica revisar, campo(s) fijado(s) por el vinculo BORRADOR_4_1 (salida); el ajuste tiene la ultima palabra";
const parte = "pago k: asignado en parte (1 de 2) y es RENDIMIENTO, no un deposito; asignalo entero (ventas: pd_001)";
const avBorr = S.ccAvisosBorradorMulti(null, [], null, { info: { problemas: [parte, parte], conflictos: [conflicto, conflicto] } });
assert("A7: el conflicto con un ajuste tuyo, en llano", avBorr.avisos.length === 1 && !/conflicto|BORRADOR/.test(avBorr.avisos[0]), avBorr);
assert("A8: dos cobros con el mismo problema, una línea", avBorr.errores.length === 1, avBorr.errores);
const val = S.ccValidacionBorrador({ regSalida: {}, regCobro: {}, cantidadOk: true, sim: { info: { problemas: [parte, parte], aplicados: [] } } });
assert("A8: también en los motivos de no guardar", val.motivos.length === 1, val.motivos);
assert("uno desconocido, sin el prefijo y con mayúscula",
  S.ccProblemaEnLlano("venta pd_9: algo raro") === "Algo raro", S.ccProblemaEnLlano("venta pd_9: algo raro"));

console.log("== Tildes de los avisos del motor (§C) ==");
const SIN_TILDE = /\b(numero|valida|categoria|subcategoria|direccion|aportacion|integro|historico|posicion|deposito|transaccion|retencion|Revision|habia|decidelo|cambiaria|ningun)\b/;
// Solo dentro de los textos ("…"); la nota «pendiente: …» no se enseña nunca (js/23 y js/26 la quitan).
const sinTilde = { test: l => [...l.matchAll(/"((?:[^"\\]|\\.)*)"/g)].some(m => SIN_TILDE.test(m[1])) };
const lineas = fuente("21-fiscal.js").split("\n").concat(fuente("22-informe-renta.js").split("\n"))
  .filter(l => /fiscMarcarRevisar|fiscAnadirNota|detalle:|^\s+"/.test(l) && !/^\s*(\/\/|\*)/.test(l) && sinTilde.test(l));
assert("ningún aviso de js/21 ni js/22 sin tilde", lineas.length === 0, lineas);

console.log("== Pequeños de pantalla ==");
// El aviso lo escribe csvTextoCargado (test_csv_nuevas_paso_csvnuevas1.js).
assert("js/12: «reparto/repartos», no «filas»", fuente("12-carga-archivos.js").includes('cuantos(n, "reparto", "repartos")'));
assert("js/19: la copia con cache calla el aviso del archivo de rendimientos",
  fuente("19-arranque.js").includes('copia.cache ? "copia" : false'));
assert("js/13: el modo oscuro no para el arranque sin almacenamiento",
  /try \{ if \(localStorage\.getItem\("reental_dark"\)/.test(fuente("13-inicio.js")));
const sb4 = { console, document: { getElementById: () => null } };
sb4.globalThis = sb4;
vm.createContext(sb4);
for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js"]) vm.runInContext(fuente(f), sb4, { filename: f });
vm.runInContext('state.config = { etherscan_api_key: "k", wallet: "0x" + "1".repeat(40), vault: "0x" + "1".repeat(40) };', sb4);
const p4 = sb4.configValidaParaSincronizar();
assert("js/04: vault igual a la wallet dice «distinto de tu wallet»", p4.some(m => m.includes("distinto de tu wallet")), p4);

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK -> " + (fallos ? fallos + " FALLOS" : "TODO VERDE"));
process.exit(fallos ? 1 : 0);
