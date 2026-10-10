/* Test unitario del informe imprimible (js/27): lo que la paridad de cifras
 * no ve (paridad_informe_pdf_paso_63 compara las cifras de cada tabla con
 * las cifras de referencia).
 *
 * - Un nombre con «<», «&» o comillas sale como texto, no como HTML; una
 *   wallet con comillas no rompe el pie de página.
 * - Sin «qué tipo de rendimiento son» ni el enlace al manual de Hacienda
 *   (la app facilita, no es una guía).
 * - II, III y IV empiezan hoja; el pie lleva la wallet, la hora y
 *   «Página n de N»; el <title> es el nombre que propone el PDF.
 * - Los textos del motor como los dice la app (excelTexto): fechas
 *   dd/mm/aaaa y «sincronizar»; los avisos, con mayúscula.
 * - Sin nada: «Ninguno en este ejercicio.», «No disponible.» y «Ninguno.»
 *   en los avisos; el ejercicio en curso lo dice.
 * - Las franjas de un bloque ocupan toda la fila; los anchos suman 100 %.
 * - El informe no cambia lo que recibe y dos veces da la misma página;
 *   «Generado el» es la hora de aquí.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/test_informe_pdf_paso_63.js
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
const sb = sandbox(MODULOS_PDF, HORA_APP);
const AHORA = new Date(2026, 9, 5, 9, 7);   // hora de aquí

/* Un informe pequeño con lo que hace falta para cada comprobación. */
function informe(cambios = {}) {
  const tabla = filas => ({ filas, a_declarar_en: "Rendimientos del capital mobiliario (base del ahorro)" });
  return Object.assign({
    ejercicio: 2025,
    cabecera: { titular: "Ana <b>&</b> \"Eva\"", nif: "00000000T", wallet: '0xab"cd\\', periodo_desde: "2025-01-01",
      periodo_hasta: "2025-12-31", anio_terminado: true, datos_hasta: "2026-03-01", divisa: "EUR", alcance: "Todo." },
    resumen: [
      { grupo: "2. Rendimientos del capital mobiliario", clave: "rend_inmuebles", concepto: "Rendimientos de inmuebles tokenizados",
        importe: 10.5, unidad: "EUR", nota: "Importe íntegro.", total: false },
      { grupo: "3. Ganancias y pérdidas patrimoniales", clave: "gp_total", concepto: "Total ganancias y pérdidas patrimoniales",
        importe: 3, unidad: "EUR", nota: null, total: true },
      { grupo: "4. Gastos: comisiones de red (gas)", clave: "gas_pol", concepto: "Pagadas en POL", importe: 0.123456,
        unidad: "POL", nota: null, total: false },
    ],
    inversiones_activas: { fecha_corte: "2025-12-31", anio_terminado: true, nota: "A coste.",
      inmuebles: { filas: [{ nombre: "Casa <script>", cantidad: 2, coste_usd: 210, coste_usd_parcial: true, coste_eur: 200 }], subtotal_eur: 200 },
      vault: { saldo_usd: 11, saldo_eur: 10, fecha_tipo_bce: "2025-12-31", aviso: "falta el tipo del 2025-12-30: vuelve a ejecutar el programa", nota: "" },
      otros: { filas: [], subtotal_eur: 0 }, total_eur: 210 },
    detalle: {
      rendimientos: tabla([{ fecha: "2025-06-30", inmueble: "Casa & Co", periodo: "#6/2025", tipo: "Rendimiento reinvertido",
        integro_usd: 1, integro_eur: 0.9, retencion_usd: 0, retencion_eur: 0, pct_retencion: null, neto_usd: 1, neto_eur: 0.9 }]),
      recompensas: tabla([]), ventas_inmuebles: tabla([]), permutas: tabla([]),
    },
    avisos: [{ fecha: "2025-05-01", tipo: "revisar", concepto: "Venta X", detalle: "sin precio del 2025-05-01: vuelve a ejecutar el programa" }],
    descargo: "Descargo.", glosario: [{ termino: "Token", definicion: "Un token." }],
    nota_metodologica: [{ titulo: "Fechas", texto: "Desde el 2025-01-01." }],
  }, cambios);
}
// Rellena los subtotales que lee la tabla de rendimientos.
function conSubtotales(inf) {
  const r = inf.detalle.rendimientos;
  r.subtotal_con_retencion = r.subtotal_sin_retencion = r.total = Object.assign({ pct_retencion: null }, r.filas[0] || {});
  return inf;
}

const inf = conSubtotales(informe());
const antes = JSON.stringify(inf);
const html = sb.pdfHtml(inf, AHORA);
const bloques = sb.pdfBloques(inf, AHORA);

// ---------- Textos de los datos ----------
assert("un nombre con «<script>» sale como texto", html.includes("Casa &lt;script&gt;") && !html.includes("<script"));
assert("el titular con «<b>», «&» y comillas sale como texto",
  html.includes("Ana &lt;b&gt;&amp;&lt;/b&gt; &quot;Eva&quot;"), html.match(/Ana[^<]*/));
assert("una wallet con comillas y barra no rompe el pie (CSS)", html.includes('Wallet 0xab\\"cd\\\\'), html.match(/Wallet [^·]*/));
// El pie va dentro de <style>.
const conStyle = sb.pdfHtml(conSubtotales(informe({ cabecera: Object.assign({}, inf.cabecera,
  { wallet: "0xab</style><h1>X</h1>" }) })), AHORA);
assert("A10: una wallet con «</style>» no cierra los estilos",
  conStyle.split("</style>").length === 2 && !conStyle.includes("<h1>X") && conStyle.includes("0xab\\3c /style"));
const sinWallet = sb.pdfHtml(conSubtotales(informe({ cabecera: Object.assign({}, inf.cabecera, { wallet: null }) })), AHORA);
assert("A10: sin wallet, el pie no dice «Wallet ·»", !sinWallet.includes("Wallet ") && sinWallet.includes('"Tipos de cambio: BCE'));

// ---------- Sin «qué tipo de rendimiento son» ----------
assert("sin el tipo de rendimiento ni el enlace al manual de Hacienda",
  !/Cesión a terceros|25\.2|Manual de Hacienda|<a /.test(html));

// ---------- Hojas, pie y título ----------
const secciones = bloques.filter(b => b.tipo === "seccion");
assert("II, III y IV empiezan hoja; I y V no",
  JSON.stringify(secciones.map(s => [s.texto.split(".")[0], !!s.pagina])) ===
  JSON.stringify([["I", false], ["II", true], ["III", true], ["IV", true], ["V", false]]), secciones);
assert("el pie lleva la hora de aquí y «Página n de N»",
  html.includes("Generado el 05/10/2026 09:07") && html.includes('"Página " counter(page) " de " counter(pages)'));
assert("«Generado el» en la cabecera, con la hora de aquí",
  bloques[1].filas.some(f => f.celdas[0] === "Generado el" && f.celdas[1] === "05/10/2026 09:07"));
assert("el <title> es el nombre del PDF", html.includes("<title>Informe para la Renta 2025</title>"));
assert("A4 vertical", html.includes("size:A4 portrait"));
assert("A5: las cajas de arriba de la hoja, vacías (sin la fecha ni el título de Chrome)",
  ["top-left", "top-center", "top-right"].every(c => html.includes("@" + c + '{content:""}')));

// ---------- Textos del motor ----------
assert("los avisos, con fechas dd/mm/aaaa y «sincronizar»",
  html.includes("Sin precio del 01/05/2025: vuelve a sincronizar") && !html.includes("ejecutar el programa"));
assert("el aviso del vault, igual", html.includes("Falta el tipo del 30/12/2025: vuelve a sincronizar"));
assert("A7: los avisos empiezan con mayúscula, como en 🧾 Fiscal",
  bloques.find(b => b.clase === "pdf-avisos").filas.every(f => /^[A-ZÁÉÍÓÚÑ]/.test(f.celdas[3])));
assert("la nota metodológica, con fechas dd/mm/aaaa", html.includes("Desde el 01/01/2025."));
assert("el POL con 4 decimales y el total de G/P con su signo",
  html.includes("0,1235 POL") && html.includes("+3,00 €"));
assert("el USD parcial lleva «*» y su nota", html.includes("210,00 *") && html.includes(vmTexto("NOTA_USD_PARCIAL")));
assert("el % sin retención va en blanco", bloques.find(b => b.clase === "pdf-rendimientos").filas[0].celdas[8] === "");

// ---------- Vacíos ----------
const parrafos = bloques.filter(b => b.tipo === "parrafo").map(b => b.texto);
assert("sin recompensas, ventas ni permutas: «Ninguna en este ejercicio.» tres veces",
  parrafos.filter(t => t === "Ninguna en este ejercicio.").length === 3, parrafos);
const vacio = conSubtotales(informe({ avisos: [],
  inversiones_activas: { fecha_corte: "2026-03-01", anio_terminado: false, nota: "A coste.", inmuebles: null } }));
vacio.detalle.rendimientos.filas = [];
const bVacio = sb.pdfBloques(vacio, AHORA);
const pVacio = bVacio.filter(b => b.tipo === "parrafo").map(b => b.texto);
assert("sin rendimientos: «Ninguno en este ejercicio.» y sin tabla",
  pVacio.includes("Ninguno en este ejercicio.") && !bVacio.some(b => b.clase === "pdf-rendimientos"));
assert("sin cartera: «No disponible.»", pVacio.includes("No disponible.") && !bVacio.some(b => b.clase === "pdf-inversiones"));
assert("sin avisos: «Ninguno.»", pVacio.includes("Ninguno.") && !bVacio.some(b => b.clase === "pdf-avisos"));
assert("el ejercicio en curso lo dice", bVacio.some(b => b.tipo === "nota" && b.texto === vmTexto("NOTA_EJERCICIO_EN_CURSO")));

// ---------- Tablas ----------
const inv = bloques.find(b => b.clase === "pdf-inversiones");
assert("la franja de un bloque ocupa las 4 columnas", /<tr class="grupo"><td colspan="4">Tokens de inmuebles/.test(html) &&
  inv.filas.filter(f => f.tipo === "grupo").every(f => f.span === 4));
const sumas = [...html.matchAll(/<colgroup>(.*?)<\/colgroup>/g)].map(m =>
  [...m[1].matchAll(/width:([\d.]+)%/g)].reduce((s, x) => s + Number(x[1]), 0));
assert("en cada tabla los anchos suman 100 %", sumas.length > 3 && sumas.every(s => Math.abs(s - 100) < 0.05), sumas);
assert("cada tabla con anchos para todas sus columnas",
  bloques.filter(b => b.tipo === "tabla").every(b => b.columnas.every(c => c[2] > 0) &&
    b.filas.every(f => f.celdas.length === b.columnas.length)));

// ---------- Ramas que ningún caso grabado recorre ----------
const raro = conSubtotales(informe());
raro.detalle.rendimientos.filas[0].integro_eur = null;
raro.detalle.recompensas = { filas: [{ fecha: "2025-02-01", origen: "Staking", token: "RNT", cantidad: 1,
  precio_usd: null, precio_eur: null, importe_usd: null, importe_eur: null }],
total: { importe_usd: null, importe_eur: null }, a_declarar_en: "X" };
const transmision = (fecha, canje) => ({ activo: "USDT", operacion: "Cambio", tipo_activo: "Stablecoin", fecha_adquisicion: fecha,
  adquirido_por_canje: canje, fecha_transmision: "2025-06-01", cantidad: 1, valor_adquisicion_usd: 1, valor_adquisicion_eur: 1,
  valor_transmision_usd: 1, valor_transmision_eur: 1, gp_eur: 0 });
const totalT = { valor_adquisicion_usd: 1, valor_adquisicion_eur: 1, valor_transmision_usd: 1, valor_transmision_eur: 1, gp_eur: 0 };
raro.detalle.ventas_inmuebles = { filas: [transmision(null, false)], total: totalT, a_declarar_en: "X" };
raro.detalle.permutas = { filas: [transmision("2024-01-01", true)], total: totalT, a_declarar_en: "X" };
raro.detalle.ganancias_sin_transmision = { filas: [{ fecha: "2025-03-01", concepto: "Recibido sin aportación", token: "RNT",
  cantidad: 2, importe_usd: null, importe_eur: null }], total: { importe_usd: null, importe_eur: null }, a_declarar_en: "X" };
const bRaro = sb.pdfBloques(raro, AHORA);
const celdas = clase => bRaro.filter(b => b.clase === clase).map(b => b.filas[0].celdas);
assert("A14: un rendimiento sin el íntegro en euros sale «—»", celdas("pdf-rendimientos")[0][5] === "—");
assert("A14: una recompensa sin precio sale «—» en precios e importes",
  celdas("pdf-recompensas")[0].slice(4).every(x => x === "—"), celdas("pdf-recompensas")[0]);
const [venta, permuta] = celdas("pdf-transmisiones");
assert("A14: una venta sin fecha de compra sale «—»", venta[2] === "—", venta);
assert("A14: una permuta de un token del canje lleva «*» y su nota",
  permuta[3] === "01/01/2024 *" && bRaro.some(b => b.tipo === "nota" && b.texto === vmTexto("NOTA_CANJE_INFORME")), permuta);
assert("A14: una ganancia sin transmisión sin importe sale «—»", celdas("pdf-otras")[0].slice(4).every(x => x === "—"),
  celdas("pdf-otras")[0]);

// ---------- Solo lee ----------
assert("no cambia el informe", JSON.stringify(inf) === antes);
assert("dos veces, la misma página", sb.pdfHtml(inf, AHORA) === html);

function vmTexto(nombre) { return vm.runInContext(nombre, sb); }

console.log("\n" + ok + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
