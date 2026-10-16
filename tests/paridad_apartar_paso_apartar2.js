/* PARIDAD de apartar en bloque («Toda la dirección» y «Todo el token»).
 *
 * Lee los escenarios de los casos (base, apartado y deshecho, con los datos
 * del usuario), pasa cada uno por la clasificacion de la app (js/01, 02,
 * 05, 10 y 14 en una VM de Node, como ejecutarClasificacion sin DOM) y
 * compara con las cifras de referencia de la app (tests/cifras_referencia.js)
 * registro a registro, campo a campo. Comprueba además que la app ofrece
 * «Toda la dirección» en los movimientos de las direcciones del caso
 * (txOpcionesApartar), que el bloque que escribe (txSpamUsuarioCon de
 * js/18) es exactamente el del escenario apartado, que deshacer
 * (txSpamUsuarioSin) vuelve al de antes y que cada fila apartada lleva su ↩
 * (txEstadoSpam «regla»).
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_apartar_paso_apartar2.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const BASE = path.join(RAIZ, "Reental-SPA", "js");
const { leerCasos, referencia, diferencias, comoGrabado, minimo } = require("./cifras_referencia.js");
const datos = leerCasos("paridad_apartar2.json");

function contexto(archivos) {
  const sb = { console, log: () => {}, toast: () => {}, state: {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext('if (typeof ZONA_FECHAS !== "undefined") ZONA_FECHAS = "UTC";', sb);  // los casos son en UTC
  vm.runInContext("log = () => {}; toast = () => {};", sb);
  return sb;
}

const eqVal = (a, b) => !diferencias(comoGrabado(a), comoGrabado(b)).length;

function ejecutarApp(cacheRaw) {
  const sb = contexto(["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"]);
  Object.assign(sb, { __cache: structuredClone(cacheRaw), __config: structuredClone(datos.config), __csv: datos.csv_texto });
  vm.runInContext(`
    state.config = __config;
    __csvRes = cargarCsvRendimientos(__csv);
    __c = asegurarEstructuraCache(__cache);
    descubrimientoDinamico(__c, __csvRes.filas, __csvRes.indicePorHash,
      normalizarDireccion(__config.wallet), normalizarDireccion(__config.vault));
    __regs = clasificarTransacciones(__c, __csvRes.filas, __csvRes.indicePorHash, __config, {});
  `, sb);
  return sb.__regs;
}

minimo(datos.escenarios, 3, "escenarios");
let fallos = 0;
function comprobar(nombre, cond, extra) {
  console.log((cond ? "  OK   " : "  FALLO ") + nombre + (!cond && extra ? " -> " + extra : ""));
  if (!cond) fallos++;
}

const [base, apartado, deshecho] = datos.escenarios;
const tx = contexto(["01-constantes.js", "02-utilidades.js", "05-cache.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"]);
tx.__config = datos.config;
vm.runInContext("state.config = __config;", tx); // js/01 declara su propio `state`

console.log("=== Lo que ofrece y escribe la app ===");
const ctxBase = tx.construirContexto(tx.asegurarEstructuraCache(structuredClone(base.cache)));
const porClaveBase = new Map(ejecutarApp(base.cache).map(r => [r.clave, r]));
const ofrecida = datos.de_las_direcciones.every(c =>
  datos.direcciones.includes(tx.txOpcionesApartar(porClaveBase.get(c), ctxBase).direccion));
comprobar("ofrece «Toda la dirección» en los " + datos.de_las_direcciones.length + " movimientos de esas direcciones", ofrecida);
const F = datos.fecha + "T10:00:00Z";
/* Lo que el usuario ya mandó al spam se conserva: se parte de su bloque y
   deshacer vuelve a él. */
const previo = base.cache.spam_usuario ? structuredClone(base.cache.spam_usuario) : undefined;
let bloque = previo ? structuredClone(previo) : undefined;
for (const a of datos.direcciones.concat([datos.distribuidor])) bloque = tx.txSpamUsuarioCon(bloque, "direcciones", a, F);
bloque = tx.txSpamUsuarioCon(bloque, "tokens", datos.token_spam, F, "SPAM");
bloque = tx.txSpamUsuarioCon(bloque, "tokens", vm.runInContext("USDT", tx), F, "USDT");
comprobar("el bloque es el del escenario apartado", eqVal(bloque, apartado.cache.spam_usuario), JSON.stringify(bloque));
let vuelta = bloque;
for (const a of datos.direcciones.concat([datos.distribuidor])) vuelta = tx.txSpamUsuarioSin(vuelta, "direcciones", a);
vuelta = tx.txSpamUsuarioSin(vuelta, "tokens", datos.token_spam);
vuelta = tx.txSpamUsuarioSin(vuelta, "tokens", vm.runInContext("USDT", tx));
comprobar("deshacer vuelve al bloque de antes (el del usuario, o ninguno)",
  previo ? eqVal(vuelta, previo) && eqVal(deshecho.cache.spam_usuario, previo)
         : vuelta === null && !("spam_usuario" in deshecho.cache));

for (const e of datos.escenarios) {
  console.log(`=== ${e.nombre} ===`);
  const regs = ejecutarApp(e.cache);
  const diffs = referencia(e, "salida", regs);
  comprobar(`igual a lo grabado registro a registro (${regs.length} registros, ${regs.filter(r => r.categoria === "SPAM").length} de spam)`,
    diffs.length === 0, diffs.slice(0, 5).join(" | "));
  if (e.nombre === "apartado") {
    const ajustes = e.cache.ajustes_usuario || {};
    const ctxApartado = tx.construirContexto(tx.asegurarEstructuraCache(structuredClone(e.cache)));
    const apartadas = regs.filter(r => tx.txReglaSpam(r, ctxApartado));
    const conIcono = apartadas.filter(r => tx.txEstadoSpam(r, ajustes, { regla: tx.txReglaSpam(r, ctxApartado) }) === "regla");
    console.log(`    en la tabla: ${apartadas.length} filas apartadas, ${conIcono.length} con ↩ «Quitar del spam»`);
    comprobar("cada fila apartada lleva su ↩", apartadas.length >= datos.de_las_direcciones.length && conIcono.length === apartadas.length);
    const ctxSpam = tx.txContextoSpam(e.cache);
    const motivos = Object.fromEntries(tx.txResumenSpam(regs, ctxSpam).map(m => [m.etiqueta, m.n]));
    console.log("    motivos: " + JSON.stringify(motivos));
    comprobar("el resumen del spam dice sus motivos",
      motivos["Dirección marcada como spam"] === datos.de_las_direcciones.length && motivos["Token marcado como spam"] >= 1 &&
      motivos["Dirección que intenta imitar la tuya"] === 3 && !motivos["Otro motivo"]);
  }
}

console.log(fallos ? `\nRESULTADO: ${fallos} fallo(s) ✘` : "\nRESULTADO: verde al apartar una dirección y un token y al deshacer, igual a lo grabado ✔");
process.exit(fallos ? 1 : 0);
