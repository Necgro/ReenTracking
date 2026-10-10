/* Las cifras de referencia de la app: cada paridad
 * lee sus casos (las entradas grabadas) con lo que
 * dio la app la última vez que se aprobó («salida»), los vuelve a pasar
 * por la app y compara, sin tolerancia (referencia).
 *
 * Dos sitios:
 *   - privado/datos_reales/cifras_referencia/ (solo en local): todo, también
 *     lo de tus datos. Con tus datos en privado/datos_reales/ se usa siempre
 *     este (con el de Git faltarían tus casos) y vale para la copia de tus
 *     datos con la que se grabó: si cambia, lo dice en vez de dar fallos raros.
 *   - tests/cifras_referencia/ (en Git): solo lo de los tests, sin nada tuyo.
 *     Sin tus datos, lo que no está aquí se omite.
 *
 * Si un cambio de la app altera cifras a propósito, la paridad falla.
 * Regrabar va siempre por tests/regrabar_cifras.js: sin --grabar enseña
 * TODO lo que cambia (pone CIFRAS_VER=1: un resumen al final, y con tus
 * datos cambiados compara igual y avisa); si el cambio es el buscado, --grabar
 * pasa cada paridad con REGRABAR=1, que deja lo de ahora en
 * «<nombre>.gz.nuevo», y solo si todas salen bien, en Git y en la local,
 * los pone en su sitio. CIFRAS_SOLO_GIT=1 usa la de Git aunque estén tus
 * datos.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

// Las cifras se grabaron en hora de España (la de la app): «Generado el»
// del Excel y del PDF no depende de la zona del ordenador.
process.env.TZ = "Europe/Madrid";

const DATOS = path.join(__dirname, "..", "privado", "datos_reales");
const LOCAL = path.join(DATOS, "cifras_referencia");
const GIT = path.join(__dirname, "cifras_referencia");
const REGRABAR = process.env.REGRABAR === "1";
const VER = process.env.CIFRAS_VER === "1";
const SOLO_GIT = process.env.CIFRAS_SOLO_GIT === "1";
const LEIDOS_DATOS = ["config.json", "reental_cache.json", "reental_rendimientos.csv", "reental_dividendos.csv"];
/* Código de salida de una prueba que no se puede hacer sin tus datos: la
   regresión la cuenta como omitida, no como fallo. */
const OMITIDA = 77;

function fallo(texto) {
  console.error("FALLO " + texto + ".");
  process.exit(2);
}
// sha256 con los saltos de línea como LF.
const huella = ruta => crypto.createHash("sha256")
  .update(fs.readFileSync(ruta, "latin1").replace(/\r\n/g, "\n"), "latin1").digest("hex");
const huellasDatos = () => Object.fromEntries(LEIDOS_DATOS.filter(f => fs.existsSync(path.join(DATOS, f)))
  .map(f => [f, huella(path.join(DATOS, f))]));

/* La local vale para la copia de tus datos con la que se grabó. Al
   enseñar qué cambia (CIFRAS_VER), avisa y compara igual. */
let comprobada = false;
function comprobarLocal() {
  if (comprobada) return;
  comprobada = true;
  let usados;
  try { usados = JSON.parse(fs.readFileSync(path.join(LOCAL, "version.json"), "utf8")).datos_reales || {}; }
  catch (e) { fallo("falta o está mal privado/datos_reales/cifras_referencia/version.json"); }
  const ahora = huellasDatos();
  const cambiados = [...new Set([...Object.keys(usados), ...Object.keys(ahora)])].filter(f => usados[f] !== ahora[f]);
  if (Object.keys(usados).length && !cambiados.length) return;
  const que = "tus datos de privado/datos_reales/ cambiaron desde que se grabaron las cifras de referencia (" +
    (cambiados.join(", ") || "version.json sin ellos") + ")";
  if (VER) console.log("AVISO " + que + ": lo que cambia, abajo");
  else fallo(que + ": node tests/regrabar_cifras.js enseña qué cambia");
}

/* Dónde está el archivo de casos «nombre» (null: lleva tus datos y no
   están, se omite). */
function carpetaDe(nombre) {
  if (!SOLO_GIT && fs.existsSync(path.join(DATOS, "config.json"))) {
    if (!fs.existsSync(path.join(LOCAL, nombre + ".gz"))) fallo("falta " + nombre + " en privado/datos_reales/cifras_referencia/");
    if (!REGRABAR) comprobarLocal();
    return LOCAL;
  }
  if (fs.existsSync(path.join(GIT, nombre + ".gz"))) return GIT;
  let deGit = [];
  try { deGit = JSON.parse(fs.readFileSync(path.join(GIT, "version.json"), "utf8")).archivos || []; } catch (e) { /* abajo */ }
  if (deGit.includes(nombre)) fallo("falta " + nombre + " en tests/cifras_referencia/");
  return null;
}

/* NaN e infinitos no caben en JSON: van como {"__float__": "nan"}. Los Map
   (de la VM: instanceof no los reconoce), como objetos. Lo que JSON no
   guarda (un Set, una función, un Map con claves que no son texto o
   número, o que se repiten al pasar a texto) para la prueba: si no, se
   compararía vacío con vacío. */
const FLOTANTES = { nan: NaN, inf: Infinity, "-inf": -Infinity };
const decodificar = (k, v) => (v && typeof v === "object" && "__float__" in v ? FLOTANTES[v.__float__] : v);
function codificar(k, v) {
  if (typeof v === "number" && !Number.isFinite(v)) return { __float__: Number.isNaN(v) ? "nan" : v > 0 ? "inf" : "-inf" };
  const tipo = Object.prototype.toString.call(v);
  if (tipo === "[object Map]") {
    const claves = [...v.keys()];
    if (claves.some(c => typeof c !== "string" && typeof c !== "number") || new Set(claves.map(String)).size !== claves.length) {
      throw new Error("un Map con claves que no se pueden grabar en «" + k + "»");
    }
    return Object.fromEntries([...v].map(([c, x]) => [String(c), x]));
  }
  if (tipo === "[object Set]" || typeof v === "function" || typeof v === "bigint") {
    throw new Error("algo que no se puede grabar (" + (typeof v === "object" ? "Set" : typeof v) + ") en «" + k + "»");
  }
  return v;
}
/* Texto JSON con NaN, infinitos y Map, y su lectura (sin «__float__»
   dentro, sin el reviver: es más de 5 veces más rápido). */
const aJson = v => JSON.stringify(v === undefined ? null : v, codificar);
const deJson = t => (t.includes('"__float__"') ? JSON.parse(t, decodificar) : JSON.parse(t));
/* Lo que da la app, como queda al grabarlo. */
const comoGrabado = v => deJson(aJson(v));

/* Al regrabar: cada caso que usa la prueba (hasta 3 niveles por debajo de
   lo leído) con su sitio en una copia limpia, para no grabar las entradas
   que la app haya cambiado al pasar. */
const pares = new WeakMap();
const porGrabar = [];
function emparejar(a, b, nivel) {
  if (!a || typeof a !== "object" || nivel > 3) return;
  pares.set(a, b);
  for (const k of Object.keys(a)) emparejar(a[k], b[k], nivel + 1);
}

/* Los casos de una paridad («paridad_x.json»). */
function leerCasos(nombre) {
  const carpeta = carpetaDe(nombre);
  if (!carpeta) {
    console.log("OMITIDA: " + nombre + " lleva tus datos y no están en privado/datos_reales/");
    process.exit(OMITIDA);
  }
  const texto = zlib.gunzipSync(fs.readFileSync(path.join(carpeta, nombre + ".gz"))).toString("utf8");
  const datos = deJson(texto);
  if (REGRABAR) {
    const limpio = JSON.parse(texto);
    emparejar(datos, limpio, 0);
    porGrabar.push({ carpeta, nombre, limpio });
  }
  return datos;
}

/* Que haya al menos «n» casos («que»): si no, algo dejó de leerse y el
   verde no valdría. */
function minimo(casos, n, que) {
  if (casos.length >= n) return;
  console.log("FALLO: solo " + casos.length + " " + que + " (se esperaban al menos " + n + ")");
  process.exit(1);
}

/* Diferencias entre lo grabado (a) y lo de ahora (b): lista de rutas. Los
   números, exactos (NaN igual a NaN); un campo que está en un lado y no en
   el otro también cuenta, aunque el otro lo tenga a null. */
function diferencias(a, b, ruta = "", out = []) {
  const x = a === undefined ? null : a, y = b === undefined ? null : b;
  if (typeof x === "number" && typeof y === "number") {
    if (x !== y && !(Number.isNaN(x) && Number.isNaN(y))) out.push(ruta + ": antes " + x + " · ahora " + y);
    return out;
  }
  if (x && y && typeof x === "object" && typeof y === "object" && Array.isArray(x) === Array.isArray(y)) {
    const tiene = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (tiene(x, k) !== tiene(y, k)) out.push(ruta + "." + k + ": solo " + (tiene(x, k) ? "antes" : "ahora"));
      else diferencias(x[k], y[k], ruta + "." + k, out);
    }
    return out;
  }
  if (x !== y) out.push(ruta + ": antes " + JSON.stringify(x) + " · ahora " + JSON.stringify(y));
  return out;
}

/* Todas las diferencias, para el resumen de CIFRAS_VER. */
const vistas = [];

/* Lo que da ahora la app (app) frente a lo grabado en caso[campo]: la
   lista de diferencias. Al regrabar no compara: lo apunta para grabarlo. */
function referencia(caso, campo, app) {
  if (!REGRABAR) {
    const difs = diferencias(caso[campo], comoGrabado(app));
    if (VER) vistas.push(...difs);
    return difs;
  }
  const destino = pares.get(caso);
  // Un fallo de la prueba, no de la app: fuera del «error en la app» de quien llama.
  if (!destino) fallo("un caso más hondo de 3 niveles, o una copia, no se puede regrabar (" + campo + ")");
  destino[campo] = JSON.parse(aJson(app));
  return [];
}

process.on("exit", codigo => {
  // Al enseñar qué cambia: todas las diferencias, por ruta (sin los
  // números de caso y de fila), con cuántas son y un ejemplo.
  if (VER && vistas.length) {
    const grupos = new Map();
    for (const d of vistas) {
      const [ruta, resto] = [d.slice(0, d.indexOf(":")), d.slice(d.indexOf(":") + 1)];
      const clave = ruta.replace(/\.\d+(?=\.|$)/g, ".*");
      const g = grupos.get(clave) || { n: 0, ejemplo: resto.trim() };
      g.n++;
      grupos.set(clave, g);
    }
    const lineas = [...grupos].map(([ruta, g]) => "  " + g.n + " × " + (ruta || "(entero)") + " — p. ej. " + g.ejemplo.slice(0, 160));
    fs.writeSync(1, "RESUMEN de todo lo que cambia (" + vistas.length + " diferencias):\n" + lineas.join("\n") + "\n");
  }
  // Al regrabar, si la prueba sale bien: lo de ahora en «.nuevo» (lo pone
  // en su sitio regrabar_cifras.js si todo sale bien).
  if (!REGRABAR || codigo !== 0) return;
  for (const { carpeta, nombre, limpio } of porGrabar) {
    fs.writeFileSync(path.join(carpeta, nombre + ".gz.nuevo"), zlib.gzipSync(JSON.stringify(limpio)));
  }
});

module.exports = { leerCasos, referencia, diferencias, comoGrabado, minimo, huellasDatos, OMITIDA, LOCAL, GIT };
