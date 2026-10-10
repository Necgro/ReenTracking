/* PARIDAD del informe para la Renta imprimible de la app · casos de los
 * tests.
 *
 * Lee los casos (cada informe distinto grabado), hace la pagina que
 * imprime la app con ese informe (pdfHtml, js/27, en una VM de Node; se lee
 * el HTML, lo que de verdad sale en el papel) y compara lo que se lee en ella (sus tablas,
 * celda a celda, y los textos de fuera de ellas, en orden) con las cifras
 * de referencia de la app. El «Generado el», con un momento fijo (AHORA).
 * Comprueba ademas que el informe no cambia lo que recibe. Los 6
 * escenarios con tus datos van aparte (paridad_informe_pdf_real_paso_63).
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_informe_pdf_paso_63.js
 */
"use strict";
const { leerCasos } = require("./cifras_referencia.js");
const { compararCasos, sandbox } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_EXCEL } = require("./paridad_excel_paso_62.js");

const MODULOS_PDF = MODULOS_EXCEL.concat(["15-correcciones.js", "23-fiscal-pestana.js", "27-informe-pdf.js"]);

// El «Generado el» de los casos de los tests (los de tus datos, su «hoy»).
const AHORA = new Date("2026-10-08T12:00:00Z");

/* El texto de un trozo de HTML, como se lee en el papel. */
const ENTIDADES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
function textoHtml(h) {
  return h.replace(/<wbr>/g, "").replace(/<[^>]+>/g, " ").replace(/&(amp|lt|gt|quot|#39);/g, e => ENTIDADES[e])
    .replace(/\s+/g, " ").trim();
}

/* Lo que se lee en la página que imprime la app (pdfHtml): sus tablas
   (la fila de títulos, si la tiene, y el texto de cada celda; una celda
   que ocupa varias columnas deja las demás vacías) y los textos de fuera
   de ellas, en orden. */
function piezasApp(sb, informe, ahora = AHORA) {
  const html = sb.pdfHtml(informe, ahora);
  const tablas = [], textos = [];
  for (const m of html.slice(html.indexOf("<body>")).matchAll(/<table[^>]*>([\s\S]*?)<\/table>|<(h1|h2|h3|p)[^>]*>([\s\S]*?)<\/\2>/g)) {
    if (m[1] === undefined) { textos.push(textoHtml(m[3])); continue; }
    tablas.push([...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(tr => {
      const celdas = [];
      for (const td of tr[1].matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/g)) {
        celdas.push(textoHtml(td[3]));
        const span = /colspan="(\d+)"/.exec(td[2]);
        for (let i = 1; i < (span ? Number(span[1]) : 1); i++) celdas.push("");
      }
      return celdas;
    }));
  }
  return { tablas, textos };
}

module.exports = { MODULOS_PDF, piezasApp };

if (require.main === module) {
  const datos = leerCasos("paridad_informe_pdf_63.json");
  const sb = sandbox(MODULOS_PDF);
  // 754 con tus datos en privado/datos_reales/ y 746 sin ellos. Y lo de
  // cada archivo de origen de los casos, para que no se pierda uno sin que
  // se vea.
  compararCasos(datos.sinteticos, "casos de los tests", 746, {
    paso: "6.3",
    porArchivo: { "tests/test_arreglos_paso_arreglos3.py": 265, "tests/test_arreglos_paso_arreglos4.py": 115,
      "tests/test_arreglos_paso_arreglos5.py": 73, "tests/test_arreglos_paso_arreglos2.py": 57,
      "tests/test_informe_renta_paso_52f.py": 34, "tests/test_motor_fiscal_paso_51f.py": 32,
      "tests/test_cuadre_paso_cuadre2.py": 24, "tests/test_lotes_venta_paso_div15d2.py": 18,
      "tests/test_informe_renta_paso_div15d3.py": 16, "tests/test_precios_pol_paso_pol1.py": 12 },
    ejecutar: caso => {
      const antes = JSON.stringify(caso.informe);
      const salida = piezasApp(sb, caso.informe);
      return { salida, cambio: JSON.stringify(caso.informe) !== antes ? "el informe imprimible cambio el informe" : null };
    },
  });
}
