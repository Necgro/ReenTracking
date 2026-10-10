/* Test de 💰 Rendimientos: un reparto del archivo de Reental por fila,
 * como la pestaña «Movimientos» de Reentax.
 *
 * Bajo prueba (Reental-SPA/js/17-rendimientos.js):
 * - rdPeriodo / rdEstado: el periodo de la columna dividend y el estado de
 *   cada reparto (Reinvertido, Reclamado, Pendiente, Parcial, Mixto).
 * - rdRepartos: una fila por reparto con las cifras del archivo y tus
 *   decisiones (lo que sacan no sale; mandan el íntegro, la retención, la
 *   fecha y el inmueble del registro), sin las filas a 0, con la fecha del
 *   cobro y la marca de a revisar; íntegro = retención + reclamado +
 *   reinvertido + pendiente; los mismos totales que el 📊 Dashboard.
 * - rdOrdenar, rdOpciones, rdPasaFiltros, rdSumas, rdPendiente y
 *   rdTextoRecuento.
 * - rdHtmlFila / rdHtmlFilaNota / rdHtmlTotal: 12 columnas, 2 decimales
 *   con la exacta en la ayuda, un 0 es «–», hashes con enlace, ✏️ y la nota
 *   debajo.
 * - index.html: la pestaña con su tabla y js/17 cargado después de js/18.
 * - Casos límite (pendientes ya cobrados, restos, tildes, decimales).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_rendimientos_paso_ui6.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const S = { console, state: {}, log: () => {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js", "17-rendimientos.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), S, { filename: f });
}
vm.runInContext("log = function () {}; toast = function () {};", S);
const red6 = vm.runInContext("red6", S);
const RD_N = vm.runInContext("RD_N_COLUMNAS", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const json = x => JSON.stringify(x);
const H = n => "0x" + String(n).padStart(64, "0");
const fecha = s => new Date(s + "T00:00:00Z");
const fila = (dividend, f, distributed, reinvested, claimed, retained, linea, hashes) => ({
  inmueble: S.extraerInmueble(dividend), periodo_fiscal: dividend, fecha_reparto: f ? fecha(f) : null,
  distributed, reinvested, claimed, retained, importe: reinvested + claimed, linea_csv: linea, hashes: hashes || [] });

console.log("== 1. Periodo y estado ==");
assert("periodo: lo de detrás de «#»", S.rdPeriodo("Toledo 1 #3/2025") === "3/2025" && S.rdPeriodo("Fondo 1") === "" && S.rdPeriodo(null) === "");
for (const [r, c, p, e] of [[10, 0, 0, "Reinvertido"], [0, 8.1, 0, "Reclamado"], [0, 0, 10, "Pendiente"],
                            [0, 4, 5, "Parcial"], [3, 0, 2, "Parcial"], [5, 4, 0, "Mixto"], [0, 0, 0, "Pendiente"]]) {
  assert("estado de r=" + r + " c=" + c + " pendiente=" + p + ": «" + e + "»", S.rdEstado(r, c, p) === e);
}

console.log("== 2. Una fila por reparto ==");
const filas = [
  fila("Cáceres 8 #1/2026", "2026-01-31", 10, 10, 0, 0, 2, [H(1)]),           // reinvertido
  fila("Fondo 1 #1/2026", "2026-01-31", 10, 0, 8.1, 1.9, 3, [H(2)]),         // reclamado con retención (10 - 8,1 - 1,9 da 1e-15)
  fila("Fondo 1 #2/2026", "2026-02-28", 5, 0, 0, 0, 4),                      // pendiente
  fila("Caceres 8 #2/2026", "2026-02-28", 10, 0, 4.05, 0.95, 5, [H(3)]),      // parcial: quedan 5
  fila("Sevilla 2 #2/2026", "2026-02-28", 0, 0, 0, 0, 6),                    // todo a 0: no es un reparto
  fila("Sevilla 2 #3/2025", null, 4, 4, 0, 0, 7, [H(4), H(5)]),             // sin fecha, dos hashes
  fila("Coliving 1 #12/2025", "2025-12-31", 6, 6, 0, 0, 8, [H(6)]),          // tus decisiones lo sacan
];
const sin = S.rdRepartos(filas, null);
assert("sin clasificar: 6 repartos (el de todo a 0 no)", sin.filas.length === 6 && sin.sinContar === 0, sin.filas.map(f => f.linea));
const index = sin.filas.find(f => f.linea === 3);
assert("el reclamado con retención: pendiente 0 y «Reclamado»", index.pendiente === 0 && index.estado === "Reclamado" && index.retencion === 1.9 && index.reclamado === 8.1, index);
const parcial = sin.filas.find(f => f.linea === 5);
assert("el parcial: 5 pendientes y «Parcial»", parcial.pendiente === 5 && parcial.estado === "Parcial", parcial);
assert("el pendiente: «Pendiente», sin hash", sin.filas.find(f => f.linea === 4).estado === "Pendiente" && sin.filas.find(f => f.linea === 4).hashes.length === 0);
assert("periodo e inmueble de la fila", parcial.periodo === "2/2026" && parcial.inmueble === "Caceres 8" && parcial.dividend === "Caceres 8 #2/2026");
assert("la clave es la del registro del rendimiento (csv::…)", index.clave === "csv::fondo 1 #1/2026::2026-01-31", index.clave);
for (const f of sin.filas) {
  const suma = red6(f.retencion + f.reclamado + f.reinvertido + f.pendiente);
  if (Math.abs(suma - f.integro) > 1e-9) assert("cuadre de la fila " + f.linea, false, f);
}
assert("en cada fila, íntegro = retención + reclamado + reinvertido + pendiente", true);

const claves = S.clavesRendimientosCsv(filas);
const reg = (linea, extra) => Object.assign({ clave: claves[linea], categoria: "RENDIMIENTO", subcategoria: "RCM_REINVERTIDO",
  fecha: null, integro_usdt: null, retencion_usdt: null, fecha_cobro: null, revisar: false }, extra);
const registros = [
  reg(2, { fecha: "2026-01-31 00:00:00", fecha_cobro: "2026-02-03 10:11:12" }),
  reg(3, { fecha: "2026-01-31 00:00:00", subcategoria: "RCM_RECLAMADO", integro_usdt: 10, retencion_usdt: 1.9, fecha_cobro: "2026-03-01 09:00:00" }),
  reg(4, { fecha: "2026-02-28 00:00:00", subcategoria: "RCM_PENDIENTE", integro_usdt: 5, retencion_usdt: 0 }),
  // Un ajuste tuyo cambia íntegro, retención, fecha e inmueble: mandan los del registro.
  reg(5, { fecha: "2026-03-15 00:00:00", inmueble: "Cáceres 8", subcategoria: "RCM_RECLAMADO", integro_usdt: 12, retencion_usdt: 0.95, revisar: true }),
  reg(7, { fecha: "una fecha rara", revisar: true }),
  reg(8, { categoria: "MOVIMIENTO", subcategoria: "NEUTRO" }),
  // Un rendimiento que diste por bueno en Revisión y no viene del archivo.
  { clave: "0xabc::0xdef", categoria: "RENDIMIENTO", integro_usdt: 3.5 },
];
const con = S.rdRepartos(filas, registros);
assert("con tus decisiones: 5 repartos y 1 fuera", con.filas.length === 5 && con.sinContar === 1, [con.filas.length, con.sinContar]);
const p2 = con.filas.find(f => f.linea === 5);
assert("mandan el íntegro, la retención, la fecha y el inmueble del registro (y su pendiente sale de ellos)",
  p2.integro === 12 && p2.retencion === 0.95 && p2.fecha === "2026-03-15" && p2.inmueble === "Cáceres 8" && p2.pendiente === 7, p2);
assert("a revisar, con su marca", p2.revisar === true && con.filas.find(f => f.linea === 2).revisar === false);
assert("la fecha del cobro es la de la transferencia casada", con.filas.find(f => f.linea === 2).cobro === "2026-02-03 10:11:12" &&
  con.filas.find(f => f.linea === 4).cobro === null);
assert("una fecha rara en el registro no manda: la de la fila (y si no hay, sin fecha)", con.filas.find(f => f.linea === 7).fecha === null);
assert("lo que no viene del archivo se cuenta aparte", con.fueraArchivo.n === 1 && con.fueraArchivo.total === 3.5, con.fueraArchivo);
const excede = S.rdRepartos([fila("A 1 #1/2026", "2026-01-31", 5, 4, 3, 0, 2, [H(9)])], null).filas[0];
assert("una fila que suma más que su íntegro se marca, sin pendiente", excede.excedida && excede.pendiente === 0 && excede.estado === "Mixto", excede);

console.log("== 3. Mismos totales que el Dashboard ==");
for (const [nombre, regs] of [["sin clasificar", null], ["con tus decisiones", registros]]) {
  const d = S.dashRendimientosResumen(filas, regs);
  const s = S.rdSumas(S.rdRepartos(filas, regs).filas);
  const cerca = (a, b) => Math.abs(a - b) < 1e-6;
  assert(nombre + ": íntegro, retención, reclamado, reinvertido y pendiente como el Dashboard",
    cerca(s.integro, d.total) && cerca(s.retencion, d.retained) && cerca(s.reclamado, d.claimed) &&
    cerca(s.reinvertido, d.reinvested) && cerca(s.pendiente, d.pendiente), [s, d]);
  assert(nombre + ": el mismo número de repartos", S.rdRepartos(filas, regs).filas.length === d.filas, d.filas);
}

console.log("== 4. Orden, opciones y filtros ==");
assert("los más recientes primero; el mismo día, por inmueble; sin fecha al final",
  json(sin.filas.map(f => f.linea)) === json([5, 4, 2, 3, 8, 7]), sin.filas.map(f => [f.linea, f.fecha, f.inmueble]));
const op = S.rdOpciones(sin.filas);
assert("ejercicios del más reciente al más antiguo", json(op.ejercicios) === json(["2026", "2025"]), op.ejercicios);
assert("estados en su orden, solo los que hay, con su número", json(op.estados) ===
  json([{ e: "Reinvertido", n: 3 }, { e: "Reclamado", n: 1 }, { e: "Parcial", n: 1 }, { e: "Pendiente", n: 1 }]), op.estados);
assert("«Cáceres 8» y «Caceres 8», un solo inmueble (el primero visto)",
  op.inmuebles.filter(i => i.k === "caceres 8").length === 1 && op.inmuebles.length === 4, op.inmuebles);
const ver = f => sin.filas.filter(x => S.rdPasaFiltros(x, f)).map(x => x.linea);
assert("ejercicio 2025: solo el de diciembre (el sin fecha no)", json(ver({ ejercicio: "2025" })) === json([8]));
assert("estado Parcial", json(ver({ estado: "Parcial" })) === json([5]));
assert("inmueble «caceres 8»: los dos, con y sin tilde", json(ver({ inmueble: "caceres 8" })) === json([5, 2]));
assert("buscar por hash (el segundo de una fila también)", json(ver({ q: H(5).slice(-10) })) === json([7]));
assert("buscar por periodo e inmueble, sin mayúsculas", json(ver({ q: "FONDO 1 #2" })) === json([4]));
const notas = { [sin.filas.find(f => f.linea === 4).clave]: { texto: "Reclamar en marzo", modificado: null } };
assert("buscar por tu nota", json(ver({ q: "reclamar", notas })) === json([4]));
assert("lo pendiente de reclamar: 2 repartos, 10", json(S.rdPendiente(sin.filas)) === json({ n: 2, total: 10 }), S.rdPendiente(sin.filas));
assert("recuento", S.rdTextoRecuento(6, 6, false) === "6 repartos" && S.rdTextoRecuento(2, 1500, true) === "2 de 1.500 repartos" &&
  S.rdTextoRecuento(1, 1, false) === "1 reparto");

console.log("== 5. HTML ==");
const h = S.rdHtmlFila(index, {});
assert("12 columnas", (h.match(/<td/g) || []).length === RD_N && RD_N === 12, (h.match(/<td/g) || []).length);
assert("cifras con 2 decimales y la exacta en la ayuda", h.includes('title="8,1 USD">8,10<') && h.includes('title="1,9 USD">1,90<'), h);
assert("un 0 sale «–»", (h.match(/rd-cero" title="0">–</g) || []).length === 2, h);
assert("estado con su color", h.includes('rd-estado rd-e-recl">Reclamado<'));
assert("el hash, con enlace a Polygonscan", h.includes("https://polygonscan.com/tx/" + H(2)));
assert("el ✏️ para añadir una nota", h.includes('data-accion="nota"') && h.includes("Añadir una nota"));
const dos = S.rdHtmlFila(sin.filas.find(f => f.linea === 7), {});
assert("dos hashes, uno debajo de otro; sin fecha", (dos.match(/polygonscan/g) || []).length === 2 && dos.includes("rd-hash-mas") && dos.includes(">sin fecha<"));
const conCobro = S.rdHtmlFila(con.filas.find(f => f.linea === 2), {});
assert("la fecha del cobro, dd/mm/aaaa con la hora en la ayuda", conCobro.includes('title="03/02/2026 10:11, hora española · 03/02/2026 09:11 UTC">03/02/2026<'), conCobro);
assert("a revisar: su fondo y la 🔍", S.rdHtmlFila(p2, {}).includes("rd-revisar") && S.rdHtmlFila(p2, {}).includes("🔍"));
assert("un texto raro en el inmueble se escapa", !S.rdHtmlFila(Object.assign({}, index, { inmueble: "<b>x</b>" }), {}).includes("<b>x"));
const conNota = S.rdHtmlFila(index, { notaPersonal: "Hola" });
assert("con nota: el ✏️ la dice y la fila no lleva línea", conNota.includes("Tu nota") && conNota.includes("rd-con-notap"));
const notaFila = S.rdHtmlFilaNota(index, "Hola <b>", false);
assert("la nota, debajo y a todo el ancho, escapada", notaFila.includes('colspan="12"') && notaFila.includes("Hola &lt;b&gt;"), notaFila);
assert("sin nota ni editor, nada", S.rdHtmlFilaNota(index, "", false) === "");
const editor = S.rdHtmlFilaNota(index, "", true, "borrador");
assert("el editor con lo que se escribía, sin «Borrar» si no había nota", editor.includes(">borrador</textarea>") && !editor.includes("nota-borrar"));
const total = S.rdHtmlTotal(S.rdSumas(sin.filas));
assert("total: 4 columnas de texto, las 5 cifras y 3 al final", total.includes('colspan="4">Total') && (total.match(/<td class="num/g) || []).length === 5 &&
  total.includes('colspan="3"'), total);
const avisos = S.rdHtmlAvisos({ filas: [excede], fueraArchivo: { n: 2, total: 7 } }, true);
assert("avisos: sin decisiones, fuera del archivo y la fila que no cuadra",
  avisos.includes("Aún sin tus decisiones") && avisos.includes("2 rendimientos que no están en el archivo de Reental (7,00 USD) no salen aquí.") &&
  avisos.includes("1 reparto suma más que su íntegro."), avisos);

console.log("== 6. index.html ==");
const html = fs.readFileSync(path.join(SPA, "index.html"), "utf8");
const seccion = html.slice(html.indexOf('<section id="view-rendimientos"'), html.indexOf("</section>", html.indexOf('<section id="view-rendimientos"')));
assert("la pestaña ya no es «Próximamente»", !/Próximamente|Calculadora/.test(seccion));
assert("la tabla con 12 cabeceras", (seccion.match(/<th[\s>]/g) || []).length === 12 && seccion.includes('id="rdCuerpo"') && seccion.includes('id="rdTotal"'));
assert("js/17 se carga después de js/18 y antes de js/13",
  html.indexOf("js/18-transacciones.js") < html.indexOf("js/17-rendimientos.js") && html.indexOf("js/17-rendimientos.js") < html.indexOf("js/13-inicio.js"));

console.log("== 7. Auditoría de UI-6 ==");
// Un pendiente cuyo cobro ya llegó (nota de pendientesYaCobrados) no se pide reclamar.
const pend = [fila("Prueba ES #8/2026", "2026-08-31", 10, 0, 0, 0, 2)];
const regYa = [{ clave: S.clavesRendimientosCsv(pend)[2], categoria: "RENDIMIENTO", subcategoria: "RCM_PENDIENTE", revisar: false,
  nota: "rendimiento pendiente (ni reclamado ni reinvertido): sin hash, datos tomados del archivo de Reental; ya cobrado el 2026-09-05 (hash 0xabc): carga un archivo de Reental mas nuevo" }];
const ya = S.rdRepartos(pend, regYa).filas[0];
assert("A1 -> el pendiente ya cobrado lo sabe la fila y no cuenta en «Pendiente de reclamar»",
  ya.yaCobrado === "2026-09-05" && json(S.rdPendiente([ya])) === json({ n: 0, total: 0 }), ya);
assert("A1 -> y lleva su aviso con la fecha", S.rdHtmlFila(ya, {}).includes("Ya cobrado el 05/09/2026: carga un archivo de Reental más nuevo"));
assert("A1 -> sin esa nota, sigue pendiente", S.rdRepartos(pend, null).filas[0].yaCobrado === null && S.rdPendiente(S.rdRepartos(pend, null).filas).n === 1);
// Un resto de menos de medio céntimo no es pendiente.
const restos = S.rdRepartos([fila("A 1 #1/2026", "2026-01-31", 10, 0, 8.099, 1.9, 2, [H(20)]),
                             fila("B 1 #1/2026", "2026-01-31", 10, 9.999999, 0, 0, 3, [H(21)])], null).filas;
assert("A6 -> 10 = 1,9 + 8,099: «Reclamado», sin pendiente; 9,999999 de 10: «Reinvertido»",
  json(restos.map(f => [f.estado, f.pendiente])) === json([["Reclamado", 0], ["Reinvertido", 0]]) && S.rdPendiente(restos).n === 0, restos);
assert("A6 -> 0,006 sí es pendiente", S.rdRepartos([fila("A 1 #1/2026", "2026-01-31", 10, 0, 8.094, 1.9, 2, [H(22)])], null).filas[0].estado === "Parcial");
// El estado, como la subcategoría del motor.
assert("A7 -> reinvertido, reclamado y algo pendiente: «Mixto» (el motor dice RCM_MIXTO)", S.rdEstado(4, 3, 2) === "Mixto");
assert("A8 -> todo retención: «Pendiente» (el motor dice RCM_PENDIENTE), no sin estado",
  S.rdRepartos([fila("A 1 #1/2026", "2026-01-31", 1.9, 0, 0, 1.9, 2)], null).filas[0].estado === "Pendiente");
// La búsqueda no distingue tildes.
const caceres = S.rdRepartos([fila("Cáceres 8 #1/2026", "2026-01-31", 10, 10, 0, 0, 2, [H(23)])], null).filas[0];
assert("A10 -> «caceres» encuentra «Cáceres 8» (y «CÁCERES 8» también)", S.rdPasaFiltros(caceres, { q: "caceres" }) && S.rdPasaFiltros(caceres, { q: "CÁCERES 8" }));
// Un inmueble en blanco en el registro no borra el del archivo.
const fA11 = [fila("Toledo 1 #1/2026", "2026-01-31", 10, 10, 0, 0, 2, [H(24)])];
const regA11 = [{ clave: S.clavesRendimientosCsv(fA11)[2], categoria: "RENDIMIENTO", inmueble: "   " }];
assert("A11 -> inmueble «   » en el ajuste: sale el del archivo", S.rdRepartos(fA11, regA11).filas[0].inmueble === "Toledo 1");
// Sin redondear fila a fila, el total es el del Dashboard también con más de 6 decimales.
const finas = Array.from({ length: 150 }, (_, i) => fila("A " + i + " #1/2026", "2026-01-31", 1.0000004, 0, 0, 0, i + 2));
const sFinas = S.rdSumas(S.rdRepartos(finas, null).filas).pendiente, dFinas = S.dashRendimientosResumen(finas, null).pendiente;
assert("A12 -> 150 pendientes de 1,0000004: el mismo total que el Dashboard", sFinas === dFinas, [sFinas, dFinas]);
// Casos que ninguna otra prueba ve.
const fH = [fila("Fondo 1 #3/2026", "2026-03-31", 10, 0, 8.1, 1.9, 2, [H(30)]), fila("X 1 #3/2026", "2026-03-31", 0, 0, 3, 0, 3, [H(31)]),
            fila("Y 1 #3/2026", "2026-03-31", 7, 7, 0, 0, 4, [H(32)]), fila("Z 1 #3/2026", "2026-03-31", 5, 5, 0, 0, 5, [H(33)])];
const kH = S.clavesRendimientosCsv(fH);
const regH = [{ clave: kH[2], categoria: "RENDIMIENTO", retencion_usdt: 0.9 },              // tu retención manda (y deja 1 pendiente)
              { clave: kH[4], categoria: "REVISAR", subcategoria: "PENDIENTE" },             // sacado en Revisión
              { clave: kH[5], categoria: "RENDIMIENTO", fecha_cobro: "2026-02-30 10:00:00" }]; // un cobro que no existe
const dH = S.rdRepartos(fH, regH);
const iH = dH.filas.find(x => x.linea === 2);
assert("hueco -> la retención del registro manda y su pendiente sale de ella", iH.retencion === 0.9 && Math.abs(iH.pendiente - 1) < 1e-9 && iH.estado === "Parcial", iH);
assert("hueco -> lo que sacas en Revisión (REVISAR) tampoco sale", dH.sinContar === 1 && !dH.filas.some(x => x.linea === 4));
assert("hueco -> una fecha de cobro que no existe no se enseña", dH.filas.find(x => x.linea === 5).cobro === null);
const xH = dH.filas.find(x => x.linea === 3);
assert("hueco -> íntegro 0 y algo reclamado: sale, marcada «suma más que su íntegro»", !!xH && xH.excedida && xH.estado === "Reclamado", xH);
assert("hueco -> 10 = 9,996 + 0 + 0: no suma más que su íntegro (tolerancia 0,005)",
  !S.rdRepartos([fila("A 1 #1/2026", "2026-01-31", 9.996, 10, 0, 0, 2, [H(34)])], null).filas[0].excedida);
const dDash = S.dashRendimientosResumen(fH, regH), sH = S.rdSumas(dH.filas);
assert("hueco -> con todo eso, los mismos totales que el Dashboard",
  Math.abs(sH.integro - dDash.total) < 1e-9 && Math.abs(sH.retencion - dDash.retained) < 1e-9 && Math.abs(sH.reclamado - dDash.claimed) < 1e-9 &&
  Math.abs(sH.pendiente - dDash.pendiente) < 1e-9 && dH.filas.length === dDash.filas, [sH, dDash]);

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
