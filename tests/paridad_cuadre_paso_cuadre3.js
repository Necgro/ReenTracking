/* PARIDAD del cuadre con la blockchain en la app · casos de los
 * tests.
 *
 * Lee los casos (cada llamada distinta grabada, por su nombre: cuadre_cartera,
 * activos_del_cuadre, _decimales_por_contrato, leer_saldos_cuadre y
 * avisar_cuadre_en_informe), pasa la entrada por cuadreCartera, cuadreActivos,
 * cuadreDecimalesPorContrato, cuadreLeerSaldos y cuadreAvisar (js/28, en
 * una VM de Node) y compara campo a campo con las cifras de referencia de
 * la app, sin tolerancia. De los avisos, todo lo que dicen.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/paridad_cuadre_paso_cuadre3.js
 */
"use strict";
const { leerCasos } = require("./cifras_referencia.js");
const { compararCasos, sandbox } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_EXCEL } = require("./paridad_excel_paso_62.js");

const datos = leerCasos("paridad_cuadre_3.json");
const sb = sandbox(MODULOS_EXCEL.concat(["28-cuadre.js"]));

const ejecutar = {
  cuadre_cartera: e => sb.cuadreCartera(e.colas, e.apartado, e.saldos, e.cache, e.tolerancia),
  activos_del_cuadre: e => sb.cuadreActivos(e.colas, e.cache),
  _decimales_por_contrato: e => sb.cuadreDecimalesPorContrato(e.cache),
  // Cada saldo que pide la app, con la respuesta grabada en el
  // caso para la n-ésima pregunta. Se compara lo que pide y lo que da.
  leer_saldos_cuadre: e => {
    const pedidos = [];
    sb.saldoTokenOnchain = async (direccion, contrato, apiKey, decimales) => {
      const i = pedidos.length;
      pedidos.push([direccion, contrato, decimales]);
      return i < e.pedidos.length ? e.pedidos[i][3] : null;
    };
    return sb.cuadreLeerSaldos(e.activos, e.cache, "k", e.wallet, e.vault, 0).then(saldos => ({ pedidos, saldos }));
  },
  avisar_cuadre_en_informe: e => {
    const informes = {};
    for (const [anio, n] of Object.entries(e.informes)) informes[anio] = { avisos: new Array(n).fill(null) };
    sb.cuadreAvisar(informes, e.cuadre, e.hoy, e.n_revisar);
    return Object.fromEntries(Object.entries(informes).map(([anio, i]) => [anio, i.avisos.slice(e.informes[anio])]));
  },
};

(async () => {
// Las lecturas de saldos son asíncronas: se hacen antes de comparar.
const hechas = new Map();
for (const caso of datos.sinteticos) {
  if (caso.funcion === "leer_saldos_cuadre") hechas.set(caso, await ejecutar.leer_saldos_cuadre(JSON.parse(JSON.stringify(caso.entrada))));
}
// Que no se dejen de grabar las lecturas de saldos.
const lecturas = datos.sinteticos.filter(c => c.funcion === "leer_saldos_cuadre").length;
if (lecturas < 12) { console.log("FALLO: solo " + lecturas + " lecturas de saldos grabadas (se esperaban al menos 12)"); process.exit(1); }
compararCasos(datos.sinteticos, "casos de los tests", 40, {
  paso: "CUADRE-3",
  ejecutar: caso => {
    if (hechas.has(caso)) return { salida: hechas.get(caso) };
    return { salida: ejecutar[caso.funcion](JSON.parse(JSON.stringify(caso.entrada))) };
  },
  porArchivo: { "tests/test_cuadre_paso_cuadre2.py": 30 },
});
})();
