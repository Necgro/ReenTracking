/* Test unitario del libro diario en 📒 Transacciones (Reental-SPA/js/18-transacciones.js).
 *
 * Funciones bajo prueba (sección pura del módulo):
 * - txGrupoDe / txResumenTriaje: triaje A revisar · Con efecto fiscal ·
 *   Neutros · Spam (como Reentax); revisar=true manda siempre.
 * - txEjercicio / txOperacion / txActivo / txImporte: columnas legibles, sin
 *   inventar (subcategoría desconocida tal cual; sin importe → vacío).
 * - txCoincideBusqueda / txPasaFiltros / txFiltrar / txOrdenar: filtros
 *   categoría/ejercicio/inmueble/fuente/grupo + búsqueda; orden por fecha
 *   descendente con los sin fecha al final; no muta la entrada.
 * - txOpciones / txConteoCategorias: opciones solo con valores presentes y
 *   recuentos facetados (ignoran el filtro de categoría, respetan el resto).
 * - «Mandar a revisar»: txAjustesConRevisar / txAjustesSinRevisar /
 *   txEsAjusteMandarRevisar / txEstadoRevisar: ajuste {revisar:true, nota con
 *   marcador «desde la SPA»}, sin pisar ajustes ajenos, deshacer que solo
 *   borra el propio, entradas no mutadas; y con aplicarAjustesUsuario de js/14
 *   el registro queda revisar=true con la nota añadida y vuelve EXACTO al
 *   deshacer.
 * - txHtmlFila: botones por estado y «🔗»/«➕» según pendiente/vínculo.
 *
 * DATOS 100% SINTÉTICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_tx1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {}, log: () => {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
vm.runInContext("log = function () {};", sandbox); // sin DOM: los AVISO del motor se silencian
const S = sandbox;
const TX_MARCA = vm.runInContext("TX_MARCA_REVISAR", sandbox);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
function reg(o) {
  return Object.assign({
    clave: "k", fecha: "2026-01-01 10:00:00", hash: H(1), contrato: "0x" + "cc".repeat(20),
    token: null, simbolo: null, cantidad: 1, categoria: "RENDIMIENTO", subcategoria: "RCM_REINVERTIDO",
    inmueble: null, importe_usdt: null, coste_eur: null, origen: "", destino: "",
    fuente: "ONCHAIN", nota: "", revisar: false,
  }, o);
}
const R = [
  reg({ clave: "a", fecha: "2025-03-01 10:00:00", hash: H(1), categoria: "RENDIMIENTO", subcategoria: "RCM_REINVERTIDO", inmueble: "Prueba Uno", fuente: "CSV_REENTAL", nota: "dividendo T1" }),
  reg({ clave: "b", fecha: "2026-05-12 09:45:46", hash: H(2), categoria: "REVISAR", subcategoria: "PENDIENTE", inmueble: "Prueba Dos", revisar: true, nota: "salida sin contraprestacion" }),
  reg({ clave: "c", fecha: "2026-02-10 09:00:00", hash: H(3), categoria: "SPAM", subcategoria: "NEUTRO", token: "BASURA", simbolo: "BAS" }),
  reg({ clave: "d", fecha: "2026-02-10 09:00:00", hash: H(4), categoria: "COMISION", subcategoria: "NEUTRO", simbolo: "POL" }),
  reg({ clave: "e", fecha: null, hash: H(5), categoria: "COMPRA", subcategoria: "COSTE_BASE", inmueble: "Prueba Uno", coste_eur: 1000, fuente: "ONCHAIN" }),
  reg({ clave: "f", fecha: "2026-04-05 12:00:00", hash: H(6), categoria: "VENTA", subcategoria: "GPP_INMUEBLE", inmueble: "Prueba Dos", importe_usdt: 3204.5 }),
  reg({ clave: "g", fecha: "2026-05-01 12:00:00", hash: H(7), categoria: "MOVIMIENTO", subcategoria: "OTRA_COSA" }),
];

// =========================================================================
console.log("== 1. Triaje ==");
// =========================================================================
assert("RENDIMIENTO → fiscal", S.txGrupoDe(R[0]) === "fiscal");
assert("REVISAR → revisar", S.txGrupoDe(R[1]) === "revisar");
assert("SPAM → spam", S.txGrupoDe(R[2]) === "spam");
assert("COMISION → neutro", S.txGrupoDe(R[3]) === "neutro");
assert("MOVIMIENTO → neutro", S.txGrupoDe(R[6]) === "neutro");
// El traspaso del vault a la wallet.
assert("RETIRADA NEUTRO (del vault a la wallet) → neutro",
  S.txGrupoDe(reg({ categoria: "RETIRADA", subcategoria: "NEUTRO" })) === "neutro");
assert("RETIRADA GPP_RETIRADA → fiscal",
  S.txGrupoDe(reg({ categoria: "RETIRADA", subcategoria: "GPP_RETIRADA" })) === "fiscal");
assert("revisar=true manda sobre la categoría (RENDIMIENTO a revisar → revisar)",
  S.txGrupoDe(reg({ categoria: "RENDIMIENTO", revisar: true })) === "revisar");
const tri = S.txResumenTriaje(R);
assert("resumen: total 7 = revisar 1 + fiscal 3 + neutro 2 + spam 1",
  tri.total === 7 && tri.revisar === 1 && tri.fiscal === 3 && tri.neutro === 2 && tri.spam === 1, tri);

// =========================================================================
console.log("== 2. Columnas legibles ==");
// =========================================================================
assert("ejercicio = año de la fecha", S.txEjercicio(R[0]) === "2025");
assert("sin fecha → ejercicio null", S.txEjercicio(R[4]) === null);
assert("operación legible de GPP_INMUEBLE", /Venta de tokens/.test(S.txOperacion(R[5])));
assert("subcategoría desconocida se muestra tal cual (no se inventa)", S.txOperacion(R[6]) === "OTRA_COSA");
assert("activo = propiedad si la hay", S.txActivo(R[0]) === "Prueba Uno");
assert("activo = símbolo si no hay propiedad", S.txActivo(R[2]) === "BAS");
assert("importe USD nominal con formato es-ES", S.txImporte(R[5]) === "3.204,5 USD", S.txImporte(R[5]));
assert("importe € de compra bancaria", S.txImporte(R[4]) === "1.000 €", S.txImporte(R[4]));
assert("sin importe → vacío (honesto)", S.txImporte(R[0]) === "");

// =========================================================================
console.log("== 3. Filtros, búsqueda y orden ==");
// =========================================================================
const copia = JSON.stringify(R);
const todos = S.txFiltrar(R, {});
assert("sin filtros: 7 registros", todos.length === 7);
assert("no muta la entrada", JSON.stringify(R) === copia);
assert("orden: más recientes primero, sin fecha al final",
  todos.map(r => r.clave).join("") === "bgfcdae",
  todos.map(r => r.clave).join(""));
assert("empate de fecha desempata por hash (c antes que d)",
  todos.findIndex(r => r.clave === "c") < todos.findIndex(r => r.clave === "d"));
assert("el sin fecha es el último", todos[todos.length - 1].clave === "e");
assert("filtro categoría", S.txFiltrar(R, { categoria: "SPAM" }).map(r => r.clave).join() === "c");
assert("filtro ejercicio 2026 (fuera 2025 y sin fecha)", S.txFiltrar(R, { ejercicio: "2026" }).length === 5);
assert("filtro inmueble", S.txFiltrar(R, { inmueble: "Prueba Dos" }).map(r => r.clave).sort().join() === "b,f");
assert("filtro fuente CSV_REENTAL", S.txFiltrar(R, { fuente: "CSV_REENTAL" }).map(r => r.clave).join() === "a");
assert("filtro grupo neutro", S.txFiltrar(R, { grupo: "neutro" }).map(r => r.clave).sort().join() === "d,g");
assert("búsqueda por hash parcial (mayúsculas indiferentes)",
  S.txFiltrar(R, { q: H(6).slice(0, 8).toUpperCase() }).map(r => r.clave).join() === "f");
assert("búsqueda por texto de nota", S.txFiltrar(R, { q: "contraprestacion" }).map(r => r.clave).join() === "b");
assert("búsqueda por inmueble", S.txFiltrar(R, { q: "prueba uno" }).map(r => r.clave).sort().join() === "a,e");
assert("búsqueda por token", S.txFiltrar(R, { q: "basura" }).map(r => r.clave).join() === "c");
assert("filtros combinados", S.txFiltrar(R, { inmueble: "Prueba Dos", grupo: "fiscal" }).map(r => r.clave).join() === "f");

const op = S.txOpciones(R);
assert("opciones: categorías presentes ordenadas", op.categorias.join() === "COMISION,COMPRA,MOVIMIENTO,RENDIMIENTO,REVISAR,SPAM,VENTA");
assert("opciones: ejercicios desc sin null", op.ejercicios.join() === "2026,2025");
assert("opciones: inmuebles sin vacíos", op.inmuebles.join() === "Prueba Dos,Prueba Uno");
assert("opciones: fuentes presentes", op.fuentes.join() === "CSV_REENTAL,ONCHAIN");
const cc = S.txConteoCategorias(R, { categoria: "SPAM", ejercicio: "2026" });
assert("recuento facetado: ignora la categoría elegida y respeta el ejercicio",
  cc.reduce((a, c) => a + c.n, 0) === 5 && !cc.some(c => c.categoria === "RENDIMIENTO"), cc);

// =========================================================================
console.log("== 4. Mandar a revisar (ajustes) ==");
// =========================================================================
const AJ = { "0xotra": { categoria: "MOVIMIENTO", nota: "clasificado a mano desde el panel" } };
const ajCopia = JSON.stringify(AJ);
const nuevo = S.txAjustesConRevisar(AJ, " A ", "  comprobar   si es un pago ", "2026-09-28T10:00:00Z");
assert("añade la clave normalizada (trim + minúsculas)", Object.keys(nuevo).includes("a"));
assert("ajuste = revisar:true + nota con marcador, fecha y motivo compactado",
  nuevo.a.revisar === true && nuevo.a.nota === TX_MARCA + " (2026-09-28): comprobar si es un pago", nuevo.a);
assert("conserva los ajustes existentes", JSON.stringify(nuevo["0xotra"]) === JSON.stringify(AJ["0xotra"]));
assert("no muta el objeto recibido", JSON.stringify(AJ) === ajCopia);
assert("sin motivo: nota solo con marcador y fecha",
  S.txAjustesConRevisar({}, "z", "", "2026-09-28").z.nota === TX_MARCA + " (2026-09-28)");
let lanzo = false;
try { S.txAjustesConRevisar(AJ, "0xOTRA", "x", "2026-09-28"); } catch (e) { lanzo = true; }
assert("NUNCA pisa un ajuste existente (misma clave, otro caso) → lanza", lanzo);
assert("es ajuste de la SPA", S.txEsAjusteMandarRevisar(nuevo.a));
assert("ajuste del panel NO es de la SPA", !S.txEsAjusteMandarRevisar(AJ["0xotra"]));
assert("con campos extra NO es de la SPA (no se borraría información)",
  !S.txEsAjusteMandarRevisar(Object.assign({ categoria: "VENTA" }, nuevo.a)));
const sin = S.txAjustesSinRevisar(nuevo, "a");
assert("deshacer devuelve EXACTAMENTE los ajustes previos", JSON.stringify(sin) === ajCopia);
lanzo = false;
try { S.txAjustesSinRevisar(AJ, "0xotra"); } catch (e) { lanzo = true; }
assert("deshacer se niega a borrar un ajuste ajeno", lanzo);
lanzo = false;
try { S.txAjustesSinRevisar({}, "a"); } catch (e) { lanzo = true; }
assert("deshacer sin ajuste → lanza", lanzo);

assert("estado libre", S.txEstadoRevisar(R[0], {}) === "libre");
assert("estado motor (revisar=true sin ajuste)", S.txEstadoRevisar(R[1], {}) === "motor");
assert("estado ajeno", S.txEstadoRevisar(reg({ clave: "0xotra" }), AJ) === "ajeno");
assert("estado spa (aunque el registro ya esté revisar=true)",
  S.txEstadoRevisar(reg({ clave: "a", revisar: true }), nuevo) === "spa");

/* Integración con el motor: aplicarAjustesUsuario (js/14) sobre copias. */
const regs = [reg({ clave: "a", nota: "nota del motor" })];
S.aplicarAjustesUsuario(regs, { ajustes_usuario: nuevo });
assert("con el ajuste: revisar=true y nota del motor + nota de la SPA",
  regs[0].revisar === true && regs[0].nota === "nota del motor; " + nuevo.a.nota, regs[0]);
assert("la categoría NO cambia", regs[0].categoria === "RENDIMIENTO");
const regs2 = [reg({ clave: "a", nota: "nota del motor" })];
const antes = JSON.stringify(regs2);
S.aplicarAjustesUsuario(regs2, { ajustes_usuario: sin });
assert("tras deshacer: registro idéntico al original", JSON.stringify(regs2) === antes);

// =========================================================================
console.log("== 5. Fila HTML ==");
// =========================================================================
const fLibre = S.txHtmlFila(R[0], { estadoRevisar: "libre" });
assert("libre: botón mandar-revisar", /data-accion="mandar-revisar"/.test(fLibre));
assert("enlace a Polygonscan", fLibre.includes("https://polygonscan.com/tx/" + H(1)));
const fSpa = S.txHtmlFila(reg({ clave: "a", revisar: true }), { estadoRevisar: "spa" });
assert("spa: botón quitar-revisar y marca 🔍", /data-accion="quitar-revisar"/.test(fSpa) && fSpa.includes("🔍"));
const fMotor = S.txHtmlFila(R[1], { estadoRevisar: "motor" });
assert("motor: sin botones de revisar", !/mandar-revisar|quitar-revisar/.test(fMotor));
const fAjeno = S.txHtmlFila(R[0], { estadoRevisar: "ajeno" });
/* Las acciones son iconos con su burbuja: la etiqueta va en la burbuja. */
assert("ajeno: botón inactivo, sin acción", /<button[^>]*aria-disabled="true"[^>]*>.*🔍.*<b>Ya tiene un ajuste: edítalo en 🔍 Revisión<\/b>/.test(fAjeno) &&
  !/data-accion="mandar-revisar"/.test(fAjeno));
const fPend = S.txHtmlFila(R[1], { estadoRevisar: "motor", pendiente: "salida" });
assert("salida pendiente: botón 🔗 abrir-buscador", /data-accion="abrir-buscador"[^>]*><span aria-hidden="true">🔗<\/span><span class="tx-burbuja"[^>]*><b>Vincular cobro…<\/b>/.test(fPend));
assert("cobro por vincular: SIN botón 🔗 (solo salidas abren el buscador)",
  !/abrir-buscador/.test(S.txHtmlFila(R[0], { estadoRevisar: "libre", pendiente: "cobro" })));
const fVinc = S.txHtmlFila(R[5], { estadoRevisar: "libre", vinculo: { rol: "salida", ventaIds: ["pd_20260728_001"] } });
assert("vinculada: marca con id y botón ➕", fVinc.includes("<b>Venta vinculada</b>") && fVinc.includes('data-accion="ver-vinculo" data-venta="pd_20260728_001"') &&
  /abrir-buscador[^>]*><span aria-hidden="true">➕<\/span><span class="tx-burbuja"[^>]*><b>Otro cobro…<\/b>/.test(fVinc));
const fPago = S.txHtmlFila(R[0], { estadoRevisar: "libre", vinculo: { rol: "pago", ventaIds: ["pd_1"] } });
assert("pago vinculado: marca sin ➕", fPago.includes("<b>Cobro de una venta</b>") && fPago.includes('data-venta="pd_1"') && !fPago.includes("➕"));
const fXss = S.txHtmlFila(reg({ clave: 'x"><img>', nota: "<script>alert(1)</script>" }), { estadoRevisar: "libre" });
assert("escapa HTML en clave y nota", !fXss.includes("<script>") && !fXss.includes('"><img>'));
assert("fila de 9 celdas (TX-1e: sin «Retención» ni «Nota del motor»; TX-1f: + Contraparte)", (fLibre.match(/<td/g) || []).length === 9);

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
