/* PARIDAD de la descarga incremental de Etherscan.
 *
 * Lee los casos (cada descarga grabada como actualizar_transacciones, y
 * con tus datos, con lo que contestó Etherscan a
 * cada pregunta) y repite cada descarga con actualizarTransacciones (js/06,
 * en una VM de Node), contestando a cada pregunta lo grabado. Las
 * preguntas tienen que ser esas, en orden y con su bloque de inicio (si
 * no, lo grabado no vale para contestar); la cache del final (las 5
 * series, ultimo_bloque y direcciones_descargadas), lo nuevo de cada serie
 * y el error, si lo hay, se comparan con las cifras de referencia de la
 * app, sin tolerancia.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/paridad_descarga_paso_fase81.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { leerCasos } = require("./cifras_referencia.js");
const { compararCasos } = require("./paridad_motor_fiscal_paso_51f.js");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const datos = leerCasos("paridad_descarga_81.json");
const MODULOS = ["01-constantes.js", "02-utilidades.js", "05-cache.js", "06-etherscan.js"];

// Una VM por tamaño de página (la constante de js/01 es fija).
const vms = new Map();
function sandbox(pagina) {
  if (!vms.has(pagina)) {
    const sb = { console, URLSearchParams, URL };
    sb.globalThis = sb;
    vm.createContext(sb);
    for (const f of MODULOS) {
      let codigo = fs.readFileSync(path.join(BASE, f), "utf8");
      if (f === "01-constantes.js") codigo = codigo.replace(/const ETHERSCAN_MAX_REGISTROS = \d+;/, "const ETHERSCAN_MAX_REGISTROS = " + pagina + ";");
      // Sin las esperas de Etherscan (6 s por el límite, 3 s por un fallo).
      if (f === "02-utilidades.js") codigo = codigo.replace(/const sleep = ms => [^;]*;/, "const sleep = async () => {};");
      vm.runInContext(codigo, sb, { filename: f });
    }
    vm.runInContext("log = () => {}; toast = () => {};", sb);   // etherscanGet se sustituye: sin esperas
    vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sb);  // los casos son en UTC
    sb.__descargar = sb.descargarTransacciones;
    vms.set(pagina, sb);
  }
  return vms.get(pagina);
}

const SERIES = ["wallet_normales", "wallet_tokens", "wallet_internas", "vault_normales", "vault_tokens"];
const foto = c => ({ transacciones: Object.fromEntries(SERIES.map(s => [s, c.transacciones[s] || []])),
  ultimo_bloque: c.ultimo_bloque ?? null, direcciones_descargadas: c.direcciones_descargadas ?? null });

async function ejecutar(caso) {
  const e = caso.entrada;
  const sb = sandbox(e.pagina);
  const preguntas = e.preguntas;
  const difs = [];
  // La app pregunta por su fetch y lee la respuesta con su
  // etherscanGet, tal cual se grabó.
  const crudas = [];
  for (const [params, respuestas] of preguntas) for (const r of respuestas) crudas.push([params, r]);
  let i = 0;
  sb.fetch = async url => {
    const u = new URL(url);
    const p = {};
    for (const [k, v] of u.searchParams) if (k !== "apikey" && k !== "chainid") p[k] = v;
    if (i >= crudas.length) { difs.push("la app pregunta de más: " + JSON.stringify(p)); throw new Error("sin respuesta grabada"); }
    const [esperada, r] = crudas[i++];
    const texto = o => JSON.stringify(Object.keys(o).sort().map(k => [k, String(o[k])]));
    if (texto(p) !== texto(esperada)) difs.push("pregunta " + i + ": grabada " + texto(esperada) + " · app " + texto(p));
    if (r.error !== undefined) throw new Error(r.error);
    return { json: async () => { if (r.no_json) throw new Error("no es JSON"); return JSON.parse(JSON.stringify(r.json)); } };
  };
  // Los casos que sustituyen la descarga de una serie entera: se repite a
  // ese nivel (descargarTransacciones, con su dirección, acción y bloque).
  if (e.descargas) {
    let k = 0;
    sb.descargarTransacciones = async (direccion, action, apiKey, startblock) => {
      const pedida = [direccion, action, startblock];
      if (k >= e.descargas.length) { difs.push("la app descarga de más: " + JSON.stringify(pedida)); return null; }
      const [d, a, b, r] = e.descargas[k++];
      if (JSON.stringify(pedida) !== JSON.stringify([d, a, b])) difs.push("descarga " + k + ": grabada " + JSON.stringify([d, a, b]) + " · app " + JSON.stringify(pedida));
      return JSON.parse(JSON.stringify(r));
    };
  } else sb.descargarTransacciones = sb.__descargar;
  const cache = JSON.parse(JSON.stringify(e.cache));
  for (const s of SERIES) cache.transacciones[s] = cache.transacciones[s] || [];
  if (!cache.ultimo_bloque) cache.ultimo_bloque = {};
  if (cache.direcciones_descargadas === null) delete cache.direcciones_descargadas;
  let nuevas = null, error = null;
  try { nuevas = await sb.actualizarTransacciones(cache, "k", e.wallet, e.vault); } catch (err) { error = err.message; }
  if (i < crudas.length) difs.push("la app pregunta de menos: " + (crudas.length - i) + " sin hacer");
  return { salida: { cache: foto(cache), nuevas, error }, cambio: difs.length ? difs.join(" | ") : null };
}

(async () => {
  const reales = datos.reales || [];
  const casos = datos.sinteticos.concat(reales);
  const resultados = new Map();
  for (const caso of casos) resultados.set(caso, await ejecutar(caso));
  for (const caso of reales) {
    console.log("  " + caso.nombre + ": " + caso.entrada.preguntas.length + " preguntas" + (resultados.get(caso).cambio ? " (DISTINTAS)" : ""));
  }
  if (!reales.length) console.log("(sin tus datos en privado/datos_reales/: solo los casos de los tests)");
  if (reales.length && reales.length < 6) { console.log("FALLO: solo " + reales.length + " escenarios con tus datos (se esperaban 6)"); process.exit(1); }
  compararCasos(casos, "descargas", 10, {
    paso: "8.1",
    ejecutar: caso => resultados.get(caso),
    // Que no se dejen de grabar: series que fallan, wallet cambiada, sin
    // vault y tus escenarios.
    porArchivo: { "tests/test_arreglos_paso_arreglos5.py": 3, "tests/test_arreglos_paso_arreglos8.py": 2,
      "tests/test_sin_vault_paso_div12.py": 1 },
  });
})();
