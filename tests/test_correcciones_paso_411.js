/* Test unitario de los datos DERIVADOS en las filas del buscador de cobros
 * para elegir qué cobro vincular, con la salida abierta como contexto.
 *
 * Funciones bajo prueba (Reental-SPA/js/15-correcciones.js, sección pura):
 * - ccDiasEntreFechas(fechaCobro, fechaSalida): desfase en días (cobro −
 *   salida) como entero con signo; null si cualquiera de las dos fechas no es
 *   válida (honesto). Acepta registros o cadenas de fecha.
 * - ccPrecioPorTokenImplicito(cantidadCobro, cantidadTokens): cantidad ÷
 *   tokens (USD nominal 1:1) con red6 determinista; null si los tokens
 *   faltan/son 0 o la cantidad no es finita.
 * - ccHtmlFilaCobro(reg, elegida, salida): la fila completa del diálogo con el
 *   desfase («+5 d» / «−2 d», U+2212) y el precio por token (orientación,
 *   NO valoración), preservando los hooks cc-* del buscador
 *   (cc-dlg-fecha, cc-dlg-amt, cc-dlg-dir, cc-elegir, toggle-cobro) y ocultando
 *   cada derivado cuando falta su entrada (sin fecha → sin desfase; sin tokens
 *   → sin precio).
 * - PUERTA: persistencia solo vía patrón js/13; sin ids globales nuevos; el CSS
 *   nuevo solo usa tokens (modo oscuro correcto).
 *
 * El comportamiento runtime (fila pintada en el diálogo real) se comprueba en
 * los arneses headless tests/navegador/verify411*.js.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_correcciones_paso_411.js
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
const { ccDiasEntreFechas, ccPrecioPorTokenImplicito, ccHtmlFilaCobro,
        ccFechaCorta, ccFechaDiaNorm, ccCantidad } = sandbox;
const red6 = vm.runInContext("red6", sandbox);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const MENOS = "\u2212"; // U+2212 (signo menos tipográfico del formato objetivo)
const W = "0x" + "11".repeat(20);
const V = "0x" + "22".repeat(20);
const HASH = "0x" + "0001" + "ab".repeat(30);
function reg(o) {
  return Object.assign({
    clave: "k", fecha: null, hash: HASH, contrato: "0x" + "cc".repeat(20),
    origen: V, destino: W, cantidad: null, simbolo: null,
    categoria: "DEPOSITO", subcategoria: "COSTE_BASE", inmueble: null,
  }, o);
}

// =========================================================================
console.log("== 1. ccDiasEntreFechas · desfase con/sin fechas (T26) ==");
// =========================================================================
assert("cobro 5 días DESPUÉS de la salida → +5",
  ccDiasEntreFechas("2026-06-19 18:00:00", "2026-06-14 22:00:00") === 5);
assert("cobro 2 días ANTES de la salida → −2 (negativo)",
  ccDiasEntreFechas("2026-06-12", "2026-06-14") === -2);
assert("mismo día (distinta hora) → 0",
  ccDiasEntreFechas("2026-06-14 08:00:00", "2026-06-14 22:00:00") === 0);
assert("cruce de año: 30/12/2025 → 02/01/2026 = 3 días",
  ccDiasEntreFechas("2026-01-02", "2025-12-30") === 3);
assert("acepta REGISTROS (usa su .fecha), no solo cadenas",
  ccDiasEntreFechas({ fecha: "2026-06-19 18:00:00" }, { fecha: "2026-06-14 22:00:00" }) === 5);
assert("sin fecha de cobro → null (honesto)",
  ccDiasEntreFechas(null, "2026-06-14") === null);
assert("sin fecha de salida → null (honesto)",
  ccDiasEntreFechas("2026-06-19", null) === null);
assert("fecha no válida (basura) → null",
  ccDiasEntreFechas("mala", "2026-06-14") === null &&
  ccDiasEntreFechas("2026-06-19", "no-es-fecha") === null);
assert("ambas ausentes → null", ccDiasEntreFechas(null, null) === null);
assert("ccFechaDiaNorm normaliza a día y valida (AAAA-MM-DD o null)",
  ccFechaDiaNorm("2026-06-19 18:00:00") === "2026-06-19" &&
  ccFechaDiaNorm({ fecha: "2026-06-19" }) === "2026-06-19" &&
  ccFechaDiaNorm("x") === null && ccFechaDiaNorm(null) === null);
assert("ccFechaCorta sigue delegando en ccFechaDiaNorm (comportamiento intacto)",
  ccFechaCorta({ fecha: "2026-06-19 18:00:00" }) === "2026-06-19" &&
  ccFechaCorta({ fecha: null }) === null && ccFechaCorta(null) === null);

// =========================================================================
console.log("== 2. ccPrecioPorTokenImplicito · precio con/sin tokens, red6 (T26) ==");
// =========================================================================
assert("3204 ÷ 200 = 16,02 (número limpio)",
  ccPrecioPorTokenImplicito(3204, 200) === 16.02);
assert("red6 determinista: 100 ÷ 3 = red6(33,333333…)",
  ccPrecioPorTokenImplicito(100, 3) === red6(100 / 3) &&
  ccPrecioPorTokenImplicito(100, 3) === 33.333333);
assert("cantidad 0 → precio 0 (no null)", ccPrecioPorTokenImplicito(0, 5) === 0);
assert("tokens 0 → null (no se divide por cero)",
  ccPrecioPorTokenImplicito(100, 0) === null);
assert("tokens null/undefined → null (sin tokens no hay precio)",
  ccPrecioPorTokenImplicito(100, null) === null &&
  ccPrecioPorTokenImplicito(100, undefined) === null);
assert("cantidad no numérica → null",
  ccPrecioPorTokenImplicito(null, 5) === null &&
  ccPrecioPorTokenImplicito("3204", 5) === null);
assert("cantidad no finita → null",
  ccPrecioPorTokenImplicito(Infinity, 5) === null &&
  ccPrecioPorTokenImplicito(NaN, 5) === null);

// =========================================================================
console.log("== 3. ccHtmlFilaCobro · fila completa en el diálogo (T26) ==");
// =========================================================================
const SALIDA = reg({ clave: "s1", fecha: "2026-06-14 22:00:00", cantidad: 200,
                     simbolo: "RALC1", categoria: "REVISAR", inmueble: "Prueba Alcazaba 1" });
const COBRO = reg({ clave: "c1", fecha: "2026-06-19 18:00:00", cantidad: 3204,
                    simbolo: "USDT", categoria: "DEPOSITO" });
const fila = ccHtmlFilaCobro(COBRO, false, SALIDA);
/* Importe con 2 decimales (el
   exacto en su burbuja), precio «16,02 USD/token» sin ⓘ, y cada columna con
   su celda aunque falte el dato (vacía), para que las filas queden alineadas. */
const celda = (f, clase) => { const m = f.match(new RegExp('class="' + clase + '[^"]*"[^>]*>(.*?)</span>')); return m ? m[1] : null; };
assert("formato objetivo: monto con 2 decimales + fecha + «+5 d» + «16,02 USD/token» presentes",
  fila.includes(">3.204,00 USDT<") && fila.includes("📅 19/06/2026") &&
  fila.includes("+5 d") && fila.includes("16,02 USD/token"), fila.slice(0, 240));
assert("el importe exacto va en la burbuja del importe",
  fila.includes('class="cc-dlg-amt" title="3.204 USDT"'));
assert("el desfase vive en su span cc-dlg-desfase y el precio en cc-dlg-precio",
  /class="cc-dlg-desfase"[^>]*>\+5 d</.test(fila) && celda(fila, "cc-dlg-precio") === "16,02 USD/token");
assert("el precio ya no lleva ⓘ (LEYENDA-F6); su explicación va en la burbuja de la celda",
  !fila.includes("cc-info") && fila.includes('title="Cobro ÷ tokens de la venta"'));
assert("hooks de 3.3/4.10 preservados: fecha, amt, dir, botón toggle-cobro con data-clave",
  fila.includes('class="cc-dlg-fecha"') && fila.includes('class="cc-dlg-amt"') &&
  fila.includes('class="cc-dlg-dir"') && fila.includes('data-accion="toggle-cobro"') &&
  fila.includes('data-clave="c1"') && fila.includes("cc-elegir"));
assert("desfase NEGATIVO con signo tipográfico U+2212 («−2 d»)",
  ccHtmlFilaCobro(reg({ clave: "c2", fecha: "2026-06-12 10:00:00", cantidad: 100, simbolo: "USDC" }),
                 false, SALIDA).includes(MENOS + "2 d"));
assert("desfase CERO → «0 d» (mismo día)",
  ccHtmlFilaCobro(reg({ clave: "c3", fecha: "2026-06-14 09:00:00", cantidad: 100, simbolo: "USDC" }),
                 false, SALIDA).includes(">0 d<"));
assert("SIN fecha en la salida → desfase vacío (honesto), precio sigue",
  (() => { const f = ccHtmlFilaCobro(COBRO, false, reg({ clave: "s2", fecha: null, cantidad: 200 }));
           return celda(f, "cc-dlg-desfase") === "" && f.includes("16,02 USD/token"); })());
assert("SIN fecha en el cobro → desfase vacío (honesto)",
  celda(ccHtmlFilaCobro(reg({ clave: "c4", fecha: null, cantidad: 3204, simbolo: "USDT" }), false, SALIDA),
        "cc-dlg-desfase") === "");
assert("SIN tokens en la venta → precio vacío (honesto), desfase sigue",
  (() => { const f = ccHtmlFilaCobro(COBRO, false, reg({ clave: "s3", fecha: "2026-06-14 22:00:00", cantidad: null }));
           return celda(f, "cc-dlg-precio") === "" && f.includes("+5 d"); })());
assert("tokens 0 en la venta → precio vacío (no se divide por cero)",
  celda(ccHtmlFilaCobro(COBRO, false, reg({ clave: "s4", fecha: "2026-06-14 22:00:00", cantidad: 0 })),
        "cc-dlg-precio") === "");
assert("compatibilidad hacia atrás: SIN salida → ni desfase ni precio (fila válida)",
  (() => { const f = ccHtmlFilaCobro(COBRO, false);
           return celda(f, "cc-dlg-desfase") === "" && celda(f, "cc-dlg-precio") === "" &&
                  f.includes("3.204,00 USDT") && f.includes('data-accion="toggle-cobro"'); })());
assert("estado «elegida»: clase elegida + «✔» con su aria-label (4.10)",
  (() => { const f = ccHtmlFilaCobro(COBRO, true, SALIDA);
           return f.includes('class="cc-dlg-item elegida"') && f.includes(">✔</button>") &&
                  f.includes("Quitar este cobro de los elegidos"); })());
assert("el precio sale con 2 decimales: 100÷3 → «33,33 USD/token»",
  ccHtmlFilaCobro(reg({ clave: "c5", fecha: "2026-06-19", cantidad: 100, simbolo: "USDC" }), false,
                 reg({ clave: "s5", fecha: "2026-06-14", cantidad: 3 }))
    .includes("33,33 USD/token"));
assert("con lo que te costó, el % sobre ese coste (16,02 frente a 20 → −20 %)",
  ccHtmlFilaCobro(COBRO, false, SALIDA, [], 20).includes("<b> (" + MENOS + "20 %)</b>"));

// =========================================================================
console.log("== 4. PUERTA: patrón js/13, sin ids nuevos, CSS con tokens ==");
// =========================================================================
/* js/15 escribe ajustes_usuario a propósito, pero solo en
   ccGuardarAjustesDecision (decisiones de la cola, con su guardado): las
   guardas de aquí miran el resto del módulo. */
const fuente = fs.readFileSync(path.join(BASE, "15-correcciones.js"), "utf8")
  .replace(/async function ccGuardarAjustesDecision[\s\S]*?\r?\n}\r?\n/, "");
const prohibidos = [
  [/guardarCacheDisco\s*\(/, "guardarCacheDisco("],
  [/guardarJsonComo\s*\(/, "guardarJsonComo("],
  [/descargarJson\s*\(/, "descargarJson("],
  [/localStorage\s*\./, "localStorage."],
  [/state\.cache\s*=[^=]/, "state.cache = ..."],
  [/state\.cacheDirty\s*=[^=]/, "state.cacheDirty = ..."],
  [/state\.registros\s*=[^=]/, "state.registros = ..."],
  [/\.ajustes_usuario\s*=[^=]/, ".ajustes_usuario = ..."],
  [/pagos_diferidos\.ventas\.(push|pop|shift|unshift|splice)\s*\(/, "mutar pagos_diferidos.ventas"],
];
for (const [re, nombre] of prohibidos) assert("fuente sin " + nombre, !re.test(fuente));
// Confirmar y anular guardan con un solo ayudante, ccGuardarYReclasificar.
assert("guardado existente intacto: marcarCacheDirty() y await autoGuardarCache() en un solo sitio",
  (fuente.match(/marcarCacheDirty\(\)/g) || []).length === 1 &&
  (fuente.match(/await autoGuardarCache\(\)/g) || []).length === 1 &&
  (fuente.match(/await ccGuardarYReclasificar\(\)/g) || []).length === 2);
assert("4.11 NO añade $('id') globales nuevos (los derivados usan clases cc-dlg-*)",
  [...fuente.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map(m => m[1])
    .every(id => id === "estiloCorrecciones15" || id === "view-revision" || id.startsWith("cc")));
assert("ccHtmlFilaCobro recibe la salida como 3er parámetro (contexto)",
  /function ccHtmlFilaCobro\(reg, elegida, salida(, senales(, precioCompra(, importeTotal(, como = \{ ya: true \})?)?)?)?\)/.test(fuente));
assert("ccDlgActualizar resuelve la salida por clave y la pasa a la fila",
  /const salidaReg = registros\.find\(r => r\.clave === ccDlg\.salida\)/.test(fuente) &&
  /ccHtmlFilaCobro\((f\.)?c, ccDlg\.elegidos\.includes\((f\.)?c\.clave\), salidaReg[,)]/.test(fuente));
const lineasCss = fuente.split("\n")
  .filter(l => /cc-dlg-desfase|cc-dlg-precio/.test(l) && l.includes("{"));
assert("CSS de 4.11 presente y sin colores hardcodeados (solo tokens → modo oscuro)",
  lineasCss.length >= 2 && lineasCss.every(l => !/#[0-9a-fA-F]{3,8}\b/.test(l)),
  lineasCss.filter(l => /#[0-9a-fA-F]{3,8}\b/.test(l)));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
