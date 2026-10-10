/* PARIDAD de lo que la app guarda de
 * las respuestas del BCE y de CoinGecko.
 *
 * Por cada escenario de los casos, su servidor (BCE, market_chart e
 * /history de RNT y POL), leído aquí con un fetch falso, y los pasos de la
 * sincronización (js/09): pasoBce (actualizarTiposBce, js/07), pasoRnt
 * (precioRntHistorico de las fechas sin precio y no marcadas) y pasoPol
 * (precioPolHistorico), con su «hoy» y sin esperas. Compara con las cifras
 * de referencia de la app, sin tolerancia: precios_rnt, las fechas de
 * precios_rnt_no_disponibles, precios_pol, tipos_bce, bce_cobertura, el
 * error del BCE y lo que se le pidió.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/paridad_precios_tipos_paso_fase83.js
 */
"use strict";
const vm = require("vm");
const { leerCasos, referencia } = require("./cifras_referencia.js");
const { sandbox } = require("./paridad_motor_fiscal_paso_51f.js");

const datos = leerCasos("paridad_precios_tipos_83.json");

/* El BCE de verdad devuelve solo el tramo pedido (y nada si no hay tipos);
   un falso que diera la serie entera taparía que la app dejara días sin
   pedir. */
function soloElTramo(r, a, b) {
  if (r.status !== 200 || !r.json || !r.json.structure) return r;
  const j = JSON.parse(JSON.stringify(r.json));
  const fechas = j.structure.dimensions.observation[0].values;
  const dentro = fechas.map((v, i) => [v.id, i]).filter(([f]) => f >= a && f <= b);
  if (!dentro.length) return { status: 200, json: null, vacio: true };
  j.structure.dimensions.observation[0].values = dentro.map(([id]) => ({ id }));
  for (const s of Object.values(j.dataSets[0].series)) {
    s.observations = Object.fromEntries(dentro.map(([, i], k) => [String(k), s.observations[String(i)]]).filter(([, o]) => o));
  }
  return { status: 200, json: j };
}

async function ejecutar(e) {
  // Una VM por escenario: el ritmo de CoinGecko (js/08) vive en ella.
  const sb = sandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "08-coingecko.js"]);
  sb.URLSearchParams = URLSearchParams;
  const BCE = vm.runInContext("BCE_URL", sb);
  const R = vm.runInContext("coingeckoRitmo", sb);
  R.ahora = () => Date.parse(datos.hoy + "T12:00:00Z");
  R.dormir = async () => {};
  const srv = e.servidor, bcePedido = [];
  const respuesta = r => ({ ok: r.status === 200, status: r.status, json: async () => JSON.parse(JSON.stringify(r.json)),
    text: async () => (r.vacio ? "" : JSON.stringify(r.json)) });
  sb.fetch = async url => {
    const u = new URL(url);
    if (url.startsWith(BCE)) {
      const a = u.searchParams.get("startPeriod"), b = u.searchParams.get("endPeriod");
      bcePedido.push([a, b]);
      return respuesta(soloElTramo(srv.bce || datos.bce, a, b));
    }
    const token = url.includes("polygon") ? "POL" : "RNT";
    if (u.pathname.endsWith("market_chart")) return respuesta((srv.serie || {})[token] || { status: 500, json: {} });
    const d = u.searchParams.get("date");
    return respuesta(srv.history[token + "|" + d.slice(6) + "-" + d.slice(3, 5) + "-" + d.slice(0, 2)] || { status: 200, json: {} });
  };
  sb.__e = e;
  return vm.runInContext(`(async () => {
    const c = asegurarEstructuraCache(Object.assign(cacheVacia(), JSON.parse(JSON.stringify(__e.cache))));
    if (__e.bce.cobertura) c.bce_cobertura = Object.assign({}, __e.bce.cobertura);
    // BCE-1 (§B13 A6): con el BCE caído la app da error (el paso sale en rojo); la cache queda igual.
    let bceError = null;
    try { await actualizarTiposBce(c, __e.bce.fechas, ${JSON.stringify(datos.hoy)}); } catch (e) { bceError = e.message; }
    // Como pasoRnt y pasoPol (js/09).
    const noDisp = c.precios_rnt_no_disponibles || {};
    for (const f of __e.rnt.filter(f => !precioValido(c.precios_rnt[f]) && !(f in noDisp)).sort()) await precioRntHistorico(f, c);
    const precios = bloquePrecios(c, "precios_pol");
    for (const f of __e.pol.filter(f => !precioValido(precios[f])).sort()) await precioPolHistorico(f, c);
    return JSON.parse(JSON.stringify({ precios_rnt: c.precios_rnt, no_disponibles: Object.keys(c.precios_rnt_no_disponibles || {}).sort(),
      precios_pol: c.precios_pol, tipos_bce: c.tipos_bce, bce_cobertura: c.bce_cobertura ?? null, bce_error: bceError }));
  })()`, sb).then(r => Object.assign(r, { bce_pedido: bcePedido }));
}

(async () => {
  let malos = 0;
  for (const caso of datos.casos) {
    const difs = referencia(caso, "salida", await ejecutar(caso.entrada));
    console.log("  " + caso.nombre + ": " + (difs.length ? difs.length + " diferencias" : "iguales"));
    for (const d of difs.slice(0, 8)) console.log("      " + d);
    if (difs.length) malos++;
  }
  if (datos.casos.length < 4) { console.log("FALLO: solo " + datos.casos.length + " escenarios"); process.exit(1); }
  console.log(malos ? "PARIDAD 8.3: " + malos + " de " + datos.casos.length + " escenarios distintos"
    : "PARIDAD 8.3 en verde: con las respuestas grabadas del BCE y de CoinGecko, la app guarda lo grabado en los " + datos.casos.length + " escenarios");
  process.exit(malos ? 1 : 0);
})();
