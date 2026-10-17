/* Test unitario: lo que los botones del
 * Excel y del informe en 📤 Exportar (js/24) piden a 🧾 Fiscal (js/23) y al
 * informe imprimible (js/27). Lo de verdad, con la página, en
 * tests/navegador/verify64.js.
 *
 * - El cálculo guardado de 🧾 (fiResultado) se rehace si la config
 *   cambia por dentro (el formulario escribe en el mismo objeto).
 * - El año del informe (exAnioInforme, el desplegable de 📤): el elegido
 *   o, sin elegir o con otra cache, el último terminado.
 * - Sin fecha de sincronización, o si la última falló, el informe
 *   lo dice debajo de la cabecera, sin «hasta».
 * - fiCalcular da también los registros, colas y resumen de su pasada (el
 *   Excel), sin tocar los registros que recibe.
 * - El nombre del Excel, con la hora; el aviso de un fallo, el de 🧾.
 * - Sin fecha de sincronización, una fecha futura mal escrita no
 *   da por terminado el año en curso y se avisa.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/test_exportar_paso_64.js
 */
"use strict";
const vm = require("vm");
const { sandbox, HORA_APP } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_PDF } = require("./paridad_informe_pdf_paso_63.js");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const sb = sandbox(MODULOS_PDF.concat(["24-exportar.js"]), HORA_APP);
sb.structuredClone = structuredClone;
const ST = vm.runInContext("state", sb);
const FE = vm.runInContext("fiEstado", sb);
const AHORA = new Date(2026, 9, 7, 9, 5);
const W = "0x" + "e1".repeat(20);

/* Dos años de recompensas: 2025 terminado y 2026 en curso. */
const registros = () => [
  { clave: "a", fecha: "2025-03-01T10:00:00", categoria: "REWARD", revisar: false },
  { clave: "b", fecha: "2026-03-01T10:00:00", categoria: "REWARD", revisar: false }];

console.log("== 1. fiCalcular: lo que necesita el Excel ==");
{
  const regs = registros();
  const antes = JSON.stringify(regs);
  const r = sb.fiCalcular(regs, { transacciones: {} }, { wallet: W }, { hoy: "2026-10-07", descargaIncompleta: false });
  assert("da registros, colas y resumen de su pasada", Array.isArray(r.registros) && r.registros.length === 2 &&
    r.colas && typeof r.colas.values === "function" && r.resumen && typeof r.resumen === "object");
  assert("los registros son una copia: los que recibe no cambian", r.registros !== regs && JSON.stringify(regs) === antes);
  const libro = sb.excelLibro(r.registros, r.colas, r.resumen, { transacciones: {} }, { wallet: W }, r.informes, AHORA);
  assert("con ellos sale el libro, con una «Fiscal» por año", libro.hojas.some(h => h.nombre === "Fiscal 2025") &&
    libro.hojas.some(h => h.nombre === "Fiscal 2026"), libro.hojas.map(h => h.nombre));
}

console.log("== 2. 6.3 A2: el cálculo guardado y la config ==");
{
  ST.registros = registros();
  ST.cache = { transacciones: {} };
  ST.config = { wallet: W, inversor: { nombre: "Persona Uno", nif: "" } };
  FE.memo = null;
  const titular = () => sb.fiResultado().informes[2025].cabecera.titular;
  const r1 = sb.fiResultado();
  assert("sin cambios, el mismo cálculo", sb.fiResultado() === r1);
  ST.config.inversor.nombre = "Persona Dos";   // como leerConfigDesdeFormulario: el mismo objeto
  assert("el titular cambiado por dentro sale en el informe", titular() === "Persona Dos", titular());
}

console.log("== 3. El año del informe (el desplegable de 📤) ==");
{
  const EX = vm.runInContext("exEstado", sb);
  const informes = sb.fiResultado().informes;
  const anios = sb.fiAnios(informes);
  EX.anio = null;
  assert("sin elegir, el último terminado", sb.exAnioInforme(informes, anios) === 2025);
  EX.anio = { cache: ST.cache, valor: 2026 };
  assert("el elegido", sb.exAnioInforme(informes, anios) === 2026);
  ST.cache = { transacciones: {} };
  assert("con otra cache, otra vez el último terminado (como 🧾, A9)", sb.exAnioInforme(informes, anios) === 2025);
  EX.anio = { cache: ST.cache, valor: 2031 };
  assert("uno que no hay, el último terminado", sb.exAnioInforme(informes, anios) === 2025);
}

console.log("== 4. 6.3 A8: lo que 🧾 avisa de la sincronización ==");
{
  const inf = sb.fiResultado().informes[2025];
  const aviso = hasta => sb.pdfBloques(inf, AHORA, hasta).filter(b => b.tipo === "aviso").map(b => b.texto);
  const sinFecha = aviso(sb.fiHastaCuando({ transacciones: {} }, "2026-10-07"));
  assert("sin fecha apuntada, se avisa", sinFecha.length === 1 && /^Sin fecha de la última sincronización/.test(sinFecha[0]), sinFecha);
  const fallo = aviso(sb.fiHastaCuando({ ultima_sincronizacion: { fecha: "2026-05-20", etherscan_fallo: true } }, "2026-10-07"));
  assert("si la última falló, hasta qué día están completos (la frase de 🧾)", fallo.length === 1 &&
    fallo[0] === "El último intento de sincronizar falló: datos completos hasta el 20/05/2026." &&
    sb.fiHtmlCabecera(inf, sb.fiHastaCuando({ ultima_sincronizacion: { fecha: "2026-05-20", etherscan_fallo: true } }, "2026-10-07"),
      [2025], 2025).includes(fallo[0]), fallo);
  assert("sincronizada y sin fallo, nada",
    aviso(sb.fiHastaCuando({ ultima_sincronizacion: { fecha: "2026-05-20", etherscan_fallo: false } }, "2026-10-07")).length === 0);
  assert("sin «hasta» (las paridades), nada y la página de antes",
    aviso(undefined).length === 0 && sb.pdfHtml(inf, AHORA) === sb.pdfHtml(inf, AHORA, null));
  const bloques = sb.pdfBloques(inf, AHORA, { sincronizada: null });
  const html = sb.pdfHtml(inf, AHORA, { sincronizada: null });
  assert("va justo debajo de la cabecera y en la página, en su párrafo",
    bloques[1].clase === "pdf-cabecera" && bloques[2].tipo === "aviso" && html.includes('<p class="pdf-aviso">Sin fecha de la última'));
}

console.log("== 5. El nombre del Excel ==");
assert("reental_contabilidad_ con el día y la hora de aquí",
  sb.exNombreExcel(new Date(2026, 0, 2, 3, 4)) === "reental_contabilidad_2026-01-02_0304.xlsx");

console.log("== 6. Fase 6 A2: sin fecha de sincronización, una fecha futura mal escrita ==");
{
  // Hoy es el 07/10/2026; un ajuste con 2027 por 2026.
  const regs = [...registros(), { clave: "c", fecha: "2027-02-01T10:00:00", categoria: "REWARD", revisar: false }];
  const hasta = sb.fiHastaCuando({ transacciones: {} }, "2026-10-07");
  const inf = sb.fiCalcular(regs, { transacciones: {} }, { wallet: W }, hasta).informes;
  const c = inf[2026].cabecera;
  assert("2026 sigue en curso, con los datos hasta el último movimiento de verdad",
    c.anio_terminado === false && c.datos_hasta === "2026-03-01", c);
  assert("2025, terminado", inf[2025].cabecera.anio_terminado === true);
  const futuras = a => inf[a].avisos.filter(x => /fecha posterior a hoy/.test(x.detalle)).length;
  assert("la fecha de 2027 se avisa en su año y en el de hoy", futuras(2026) === 1 && futuras(2027) === 1,
    [futuras(2026), futuras(2027)]);
  const conFecha = sb.fiCalcular(regs, { transacciones: {} }, { wallet: W },
    sb.fiHastaCuando({ ultima_sincronizacion: { fecha: "2026-10-07", etherscan_fallo: false } }, "2026-10-07")).informes;
  assert("con fecha de sincronización, como antes: 2026 en curso hasta hoy",
    conFecha[2026].cabecera.anio_terminado === false && conFecha[2026].cabecera.datos_hasta === "2026-10-07");
}

console.log("== 7. Fase 6 A1: el Excel avisa de la sincronización como el PDF ==");
{
  const regs = registros();
  const textos = hoja => [...hoja.filas.values()].flatMap(f => [...f.values()]).filter(c => typeof c.valor === "string");
  const avisoExcel = hasta => {
    const r = sb.fiCalcular(regs, { transacciones: {} }, { wallet: W }, hasta);
    const libro = sb.excelLibro(r.registros, r.colas, r.resumen, { transacciones: {} }, { wallet: W }, r.informes, AHORA, hasta);
    const pdf = sb.pdfBloques(r.informes[2025], AHORA, hasta).filter(b => b.tipo === "aviso").map(b => b.texto);
    const renta = libro.hojas.filter(h => /^Fiscal /.test(h.nombre));
    const enHojas = renta.map(h => textos(h).filter(c => pdf.includes(c.valor)));
    return { pdf, enHojas, hojas: renta.length };
  };
  const sinFecha = avisoExcel(sb.fiHastaCuando({ transacciones: {} }, "2026-10-07"));
  assert("sin fecha: cada «Fiscal AAAA» lleva el aviso del PDF, en rojo y en negrita",
    sinFecha.pdf.length === 1 && sinFecha.hojas === 2 &&
    sinFecha.enHojas.every(cs => cs.length === 1 && cs[0].estilo.negrita && cs[0].estilo.color === vm.runInContext("EXCEL_COLOR.ROJO", sb)), sinFecha);
  const fallo = avisoExcel(sb.fiHastaCuando({ ultima_sincronizacion: { fecha: "2026-05-20", etherscan_fallo: true } }, "2026-10-07"));
  assert("si la última falló, el mismo texto que el PDF", fallo.pdf.length === 1 && /falló/.test(fallo.pdf[0]) &&
    fallo.enHojas.every(cs => cs.length === 1), fallo);
  const bien = avisoExcel(sb.fiHastaCuando({ ultima_sincronizacion: { fecha: "2026-05-20", etherscan_fallo: false } }, "2026-10-07"));
  const r = sb.fiCalcular(regs, { transacciones: {} }, { wallet: W }, { hoy: "2026-05-20" });
  const sinHasta = sb.excelLibro(r.registros, r.colas, r.resumen, { transacciones: {} }, { wallet: W }, r.informes, AHORA);
  assert("sincronizada, o sin «hasta» (las paridades): sin aviso",
    bien.pdf.length === 0 && !sinHasta.hojas.some(h => textos(h).some(c => /sincroniz/.test(c.valor))));
}

console.log("== 8. Fase 6 A5: el titular, el NIF y la wallet, tal cual en la hoja Fiscal ==");
{
  const config = { wallet: W, inversor: { nombre: "Calle 2024-01-05 vuelve a ejecutar el programa", nif: "X-2024-01-05" } };
  const r = sb.fiCalcular(registros(), { transacciones: {} }, config, { hoy: "2026-10-07" });
  const libro = sb.excelLibro(r.registros, r.colas, r.resumen, { transacciones: {} }, config, r.informes, AHORA);
  const hoja = libro.hojas.find(h => h.nombre === "Fiscal 2025");
  const valor = etiqueta => {
    for (const f of hoja.filas.values()) if (f.get(1) && f.get(1).valor === etiqueta) return f.get(2).valor;
    return null;
  };
  assert("como lo escribiste, como en Resumen y en el PDF",
    valor("Titular") === config.inversor.nombre && valor("NIF") === "X-2024-01-05" && valor("Wallet") === W,
    [valor("Titular"), valor("NIF")]);
}

console.log("== 9. Fase 6 A4: los avisos del Excel, con mayúscula como en el PDF ==");
{
  // Sin fecha de sincronización y con la descarga fallida: el informe avisa en el IV.
  const hasta = sb.fiHastaCuando({ ultima_sincronizacion: { fecha: null, etherscan_fallo: true } }, "2026-10-07");
  const r = sb.fiCalcular(registros(), { transacciones: {} }, { wallet: W }, hasta);
  const libro = sb.excelLibro(r.registros, r.colas, r.resumen, { transacciones: {} }, { wallet: W }, r.informes, AHORA, hasta);
  const hoja = libro.hojas.find(h => h.nombre === "Fiscal 2026");
  const enExcel = [...hoja.filas.values()].map(f => f.get(4) && f.get(4).valor).filter(v => typeof v === "string" && /descargar/.test(v));
  const enPdf = sb.pdfBloques(r.informes[2026], AHORA, hasta).filter(b => b.tipo === "tabla" && b.clase === "pdf-avisos")
    .flatMap(b => b.filas.map(f => f.celdas[3])).filter(v => /descargar/.test(v));
  assert("el aviso de la descarga, igual en el Excel y en el PDF y con mayúscula",
    enExcel.length === 1 && enExcel[0] === enPdf[0] && /^No se pudieron/.test(enExcel[0]), { enExcel, enPdf });
}

console.log("== 10. Fase 6 A9: «inversor» escrito a mano como lista o texto ==");
{
  const s4 = sandbox(["01-constantes.js", "02-utilidades.js", "04-config.js"], HORA_APP);
  const formulario = { cfgEthKey: "", cfgWallet: W, cfgVault: "", cfgNombre: "Persona Uno", cfgNif: "00000000T" };
  s4.document = { getElementById: id => ({ value: formulario[id] }) };
  for (const raro of [[], "texto", 7]) {
    vm.runInContext("state.config = " + JSON.stringify({ wallet: W, inversor: raro }), s4);
    s4.leerConfigDesdeFormulario();
    const cfg = JSON.parse(JSON.stringify(vm.runInContext("state.config", s4)));
    assert("con " + JSON.stringify(raro) + ": el nombre y el NIF escritos se quedan (y se guardan)",
      cfg.inversor && cfg.inversor.nombre === "Persona Uno" && cfg.inversor.nif === "00000000T", cfg.inversor);
  }
  const nueva = s4.conservarDatosConfig({ inversor: [] }, { inversor: { nombre: "Persona Uno", nif: "X" } });
  assert("al abrir un config.json con «inversor» como lista, se quedan el nombre y el NIF de antes, en un objeto",
    !Array.isArray(nueva.inversor) && JSON.stringify(nueva.inversor) === '{"nombre":"Persona Uno","nif":"X"}', nueva.inversor);
}

console.log("== 11. Fase 6 A12: «Última copia» con lo escrito a mano en el navegador ==");
{
  let guardado = null;
  sb.localStorage = { getItem: () => guardado, setItem: (k, v) => { guardado = v; } };
  // «Última copia: hace N días»; la fecha, el archivo y lo que llevaba, en su burbuja (title).
  const leer = () => { const h = sb.exHtmlHistorial(); const t = (h.match(/title="([^"]*)"/) || [])[1]; return (t ? t + " | " : "") + h.replace(/<[^>]+>/g, ""); };
  const texto = lista => { guardado = JSON.stringify(lista); return leer(); };
  const raro = texto([{ fecha: "2026-10-07T09:00:00Z", archivo: { x: 1 }, movimientos: "7", repartos: 3, config: "sí" }]);
  assert("sin «[object Object]» ni «?»: solo los datos del tipo que escribe la app",
    !/object|\?/.test(raro) && /^\d\d\/10\/2026 \d\d:\d\d · 3 repartos \| Última copia: (hoy|ayer|hace \d+ días)$/.test(raro), raro);
  assert("una fecha que no se lee: como si no hubiera, o la siguiente que sí",
    /ninguna/.test(texto([{ fecha: "ayer", archivo: "a.json" }])) &&
    /b\.json/.test(texto([{ fecha: "ayer", archivo: "a.json" }, { fecha: "2026-10-06T09:00:00Z", archivo: "b.json" }])));
  sb.exApuntarCopia({ fecha: "2026-10-07T10:00:00Z", archivo: "c.json", descargada: true, movimientos: 1, repartos: null, config: true, claves: false });
  assert("lo que apunta la app se lee igual", /c\.json · 1 transacción · tus datos \| Última copia: /.test(leer()),
    sb.exHtmlHistorial());
}

console.log("\n" + ok + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
