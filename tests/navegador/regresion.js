/* Regresión del proyecto, en paralelo.
 *
 * Modos:
 *   - corta: sin Chrome (tests puros, paridades con las cifras de referencia y
 *     pytest); cuando
 *     un cambio toca los motores o un módulo compartido.
 *   - completa (sin argumento): todo, navegador incluido; al cerrar cada
 *     paso y cada fase.
 *
 * Qué hace solo:
 *   - Encuentra los tests por su nombre: tests/test_*.js, los test_*.py y
 *     *_test.py de tests/ (con subcarpetas, como `pytest tests`), las
 *     paridades tests/paridad_*.js y tests/navegador/verify*.js. Un test o
 *     arnés nuevo entra sin tocar este archivo. Los arneses *_real.js
 *     (en privado/navegador/, porque comprueban tus cifras) usan los datos
 *     de privado/datos_reales/ (sin ellos se omiten); una
 *     paridad que los necesita sale con OMITIDA y también se omite.
 *   - Sirve la SPA él mismo en un puerto libre (no hace falta el servidor
 *     del 8765, ni lo toca); si NODE_PATH no lleva a puppeteer-core, usa
 *     el de %TEMP%\opencode\ui2-browser\node_modules.
 *   - Cada ejecución tiene su carpeta temporal (TEMP, TMP y TMPDIR de los
 *     tests): dos regresiones a la vez no se borran la salida. Sobre la misma carpeta del proyecto, la segunda
 *     espera a que acabe la primera.
 *
 * Un test va en verde solo si sale con código 0, no tiene ninguna línea
 * «FALLO» y su última línea es su resultado en verde (si se queda a medias
 * sin error, sale en rojo). pytest: código 0.
 *
 * Qué enseña: una línea por grupo y, de lo que falla, sus líneas de fallo y
 * las últimas. La salida entera queda en la carpeta que dice al final.
 * Termina con código 1 si algo falla.
 *
 * Uso (desde cualquier carpeta):
 *   node tests/navegador/regresion.js            (completa)
 *   node tests/navegador/regresion.js corta      (sin Chrome)
 *   (o sh tests/navegador/regresion.sh [corta], que llama a este)
 * REGRESION_HILOS=N cambia cuántos tests a la vez (por defecto, la mitad
 * de los núcleos); los arneses de navegador van como mucho de 4 en 4
 * (REGRESION_HILOS_NAV; con más se ahogan los de datos reales).
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");

const RAIZ = path.resolve(__dirname, "..", "..");
const TESTS = path.join(RAIZ, "tests");
const NAV = __dirname;
const MODO = process.argv[2] || "completa";
if (!["corta", "completa"].includes(MODO)) {
  console.error("Modo desconocido: " + MODO + " (corta o completa)");
  process.exit(2);
}
const entero = (v, def) => Math.max(1, Math.floor(Number(v) || def));
const HILOS = entero(process.env.REGRESION_HILOS, Math.ceil(os.cpus().length / 2));
const HILOS_NAV = entero(process.env.REGRESION_HILOS_NAV, Math.min(HILOS, 4));
const TOPE_MS = 5 * 60 * 1000;   // un test colgado no para la regresión

// Carpetas: BASE es la de siempre; cada ejecución, la suya dentro.
const BASE = path.join(os.tmpdir(), "opencode", "regresion");
fs.mkdirSync(BASE, { recursive: true });
const sello = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const RUN = path.join(BASE, sello + "-" + process.pid);
const LOGS = path.join(RUN, "salida");
const TMP = path.join(RUN, "tmp");
fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });
// Salidas sueltas y ejecuciones viejas: solo se guardan las 5 últimas, esta
// incluida (llevan salidas con tus datos). El nombre empieza por la fecha:
// ordenar basta.
const GUARDADAS = 5;
const viejas = fs.readdirSync(BASE).sort().reverse().filter((f, i) => {
  const p = path.join(BASE, f);
  try { return p !== RUN && (fs.statSync(p).isFile() || i >= GUARDADAS); } catch (e) { return false; }
});
for (const f of viejas) {
  try { fs.rmSync(path.join(BASE, f), { recursive: true, force: true }); } catch (e) { /* la usa otra */ }
}

// Cerrojo por carpeta del proyecto: dos regresiones del mismo proyecto a la
// vez se quitan la máquina y dan rojos falsos.
const PROYECTO = crypto.createHash("md5").update(RAIZ.toLowerCase()).digest("hex").slice(0, 8);
const CERROJO = path.join(path.dirname(BASE), "regresion-" + PROYECTO + ".lock");
const vivo = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
async function cogerCerrojo() {
  let avisado = false;
  for (;;) {
    try { fs.writeFileSync(CERROJO, String(process.pid), { flag: "wx" }); return; }
    catch (e) { if (e.code !== "EEXIST") throw e; }
    const otro = Number(fs.readFileSync(CERROJO, "utf8")) || 0;
    if (!otro || !vivo(otro)) { try { fs.rmSync(CERROJO); } catch (e) { /* otro lo quitó */ } continue; }
    if (!avisado) { console.log("(esperando a que acabe otra regresión de este proyecto, PID " + otro + ")"); avisado = true; }
    await new Promise(r => setTimeout(r, 2000));
  }
}
function soltar() {
  try { if (Number(fs.readFileSync(CERROJO, "utf8")) === process.pid) fs.rmSync(CERROJO); } catch (e) { /* ya no está */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* Chrome aún lo usa */ }
}
process.on("exit", soltar);
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => process.exit(130));

const existe = f => fs.existsSync(path.join(RAIZ, f));
// Los datos reales de las pruebas: la copia fija de privado/datos_reales/.
const existeDato = f => existe(path.join("privado", "datos_reales", f));
const CSV = existeDato("reental_rendimientos.csv") ? "reental_rendimientos.csv" : "reental_dividendos.csv";
const faltan = lista => lista.filter(f => !existeDato(f));
// Lo que leen las paridades con datos reales y los arneses *_real.js.
const PRIV_PARIDAD = ["reental_cache.json", "config.json", CSV];
const PRIV_REALES = ["reental_cache.json", "config.json", CSV, "reental_cache_prueba.json"];
// Sale con este código el test que no se puede hacer sin tus datos (lo
// decide tests/cifras_referencia.js, OMITIDA): cuenta como omitido, no como fallo.
const OMITIDA = 77;

const lista = (dir, re) => fs.readdirSync(dir).filter(f => re.test(f)).sort();
function listaHondo(dir, re) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__pycache__" && !e.name.startsWith(".")) out.push(...listaHondo(p, re)); }
    else if (re.test(e.name)) out.push(p);
  }
  return out.sort();
}
const rel = f => path.relative(RAIZ, f).split(path.sep).join("/");

const env = Object.assign({}, process.env, {
  TEMP: TMP, TMP: TMP, TMPDIR: TMP,     // la carpeta temporal de esta ejecución
  PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8",
});
function prepararNodePath() {
  const rutas = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
  for (let d = NAV; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, "node_modules", "puppeteer-core"))) return true;
    if (path.dirname(d) === d) break;
  }
  if (rutas.some(r => fs.existsSync(path.join(r, "puppeteer-core")))) return true;
  const deSiempre = path.join(os.tmpdir(), "opencode", "ui2-browser", "node_modules");
  if (fs.existsSync(path.join(deSiempre, "puppeteer-core"))) {
    env.NODE_PATH = [deSiempre, ...rutas].join(path.delimiter);
    return true;
  }
  return false;
}

// Ejecuta un programa y guarda toda su salida en LOGS/<nombre>.txt.
function correr(cmd, args, nombre, extraEnv) {
  return new Promise(fin => {
    const t0 = Date.now();
    const hijo = spawn(cmd, args, { cwd: RAIZ, env: extraEnv ? Object.assign({}, env, extraEnv) : env,
                                    windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const trozos = [];
    let extra = "";
    hijo.stdout.on("data", d => trozos.push(d));
    hijo.stderr.on("data", d => trozos.push(d));
    const tope = setTimeout(() => { extra += "\n(parado: más de " + TOPE_MS / 1000 + " s)"; hijo.kill(); }, TOPE_MS);
    hijo.on("error", e => { extra += "\n" + e.message; });
    hijo.on("close", codigo => {
      clearTimeout(tope);
      const salida = Buffer.concat(trozos).toString("utf8") + extra;
      fs.appendFileSync(path.join(LOGS, nombre.replace(/[\\/]/g, "_") + ".txt"), salida);
      fin({ codigo: codigo === null ? -1 : codigo, salida, ms: Date.now() - t0 });
    });
  });
}

// Un test de Node va bien si sale con 0, sin «FALLO» y con su resultado al final.
const EN_VERDE = /verde|\b0 fallo/i;
function veredicto(r) {
  if (r.codigo === OMITIDA) return { ok: true, omitido: true, salida: r.salida };
  if (r.codigo !== 0) return { ok: false, salida: r.salida };
  if (/^\s*FALLO\b/m.test(r.salida)) return { ok: false, salida: r.salida + "\n(sale con 0 pero tiene líneas FALLO)" };
  const ultima = r.salida.trimEnd().split(/\r?\n/).pop() || "";
  if (!EN_VERDE.test(ultima)) return { ok: false, salida: r.salida + "\n(terminó sin su línea de resultado: se quedó a medias)" };
  return { ok: true, salida: r.salida };
}

// Un trabajo = nombre + función que devuelve {ok, salida, ms}.
function trabajoNode(f, extraEnv) {
  const nombre = rel(f) + (extraEnv ? " (copia pública)" : "");
  return { nombre, hacer: async () => {
    const r = await correr(process.execPath, [f], nombre, extraEnv);
    return Object.assign(veredicto(r), { ms: r.ms });
  } };
}
// pytest en varios trozos a la vez, repartidos por tamaño del archivo.
function trabajosPytest(n) {
  const archivos = listaHondo(TESTS, /^test_.*\.py$|_test\.py$/)
    .map(f => ({ f, peso: fs.statSync(f).size }))
    .sort((a, b) => b.peso - a.peso);
  const trozos = Array.from({ length: Math.min(n, archivos.length) }, () => ({ peso: 0, fs: [] }));
  for (const a of archivos) {
    const t = trozos.reduce((m, x) => (x.peso < m.peso ? x : m));
    t.peso += a.peso; t.fs.push(a.f);
  }
  return trozos.map((t, i) => ({ nombre: "pytest (trozo " + (i + 1) + ")", pytest: true, hacer: async () => {
    const r = await correr("python", ["-m", "pytest", "-q", "-p", "no:cacheprovider", ...t.fs], "pytest_" + (i + 1));
    return { ok: r.codigo === 0, salida: r.salida, ms: r.ms };
  } }));
}

// Lo que tardó cada test la última vez: los lentos empiezan primero, para
// que no se queden solos al final.
const TIEMPOS = path.join(path.dirname(BASE), "regresion_tiempos.json");
let tiempos = {};
try { tiempos = JSON.parse(fs.readFileSync(TIEMPOS, "utf8")); } catch (e) { /* primera vez */ }

async function enPool(trabajos, hilos) {
  const res = new Array(trabajos.length);
  const orden = trabajos.map((t, k) => k)
    .sort((a, b) => (tiempos[trabajos[b].nombre] ?? 1e9) - (tiempos[trabajos[a].nombre] ?? 1e9));
  let i = 0;
  async function obrero() {
    while (i < orden.length) {
      const k = orden[i++];
      try { res[k] = Object.assign({ nombre: trabajos[k].nombre, pytest: trabajos[k].pytest }, await trabajos[k].hacer()); }
      catch (e) { res[k] = { nombre: trabajos[k].nombre, ok: false, salida: String(e && e.stack || e), ms: 0 }; }
      tiempos[res[k].nombre] = res[k].ms;
    }
  }
  await Promise.all(Array.from({ length: Math.min(hilos, trabajos.length) }, obrero));
  try { fs.writeFileSync(TIEMPOS, JSON.stringify(tiempos)); } catch (e) { /* no importa */ }
  // Un trabajo que no llegó a correr cuenta como fallo, nunca como verde.
  return trabajos.map((t, k) => res[k] || { nombre: t.nombre, ok: false, salida: "(no llegó a correr)", ms: 0 });
}

// De lo que falla: primero sus líneas de fallo y después las últimas.
const LINEA_FALLO = /^\s*(FALLO|✗)|Error|Traceback|FAILED|failed|\(parado|\(falló|\(sale con 0|\(terminó|\(no llegó/;
function resumenFallo(salida) {
  const lineas = salida.trimEnd().split(/\r?\n/);
  const fallos = lineas.filter(l => LINEA_FALLO.test(l) && !/^\s+at /.test(l)).slice(0, 8);
  const cola = lineas.slice(-3).filter(l => !fallos.includes(l));
  return [...fallos, ...(fallos.length && cola.length ? ["     …"] : []), ...cola]
    .map(l => "     " + (l.length > 300 ? l.slice(0, 300) + "…" : l)).join("\n");
}
function informar(titulo, todos, omitidos) {
  const res = todos.filter(r => !r.omitido);   // los que salen OMITIDA, aparte
  omitidos = { n: omitidos.n + todos.length - res.length, faltan: omitidos.faltan };
  const malos = res.filter(r => !r.ok);
  const s = (res.reduce((m, r) => Math.max(m, r.ms), 0) / 1000).toFixed(0);
  let linea = titulo + ": " + (res.length - malos.length) + "/" + res.length + " en verde";
  if (res.some(r => r.pytest)) {
    const sum = re => res.reduce((m, r) => m + Number(((r.salida.match(re) || [])[1]) || 0), 0);
    const extra = [[/(\d+) failed/, "fallan"], [/(\d+) errors?\b/, "con error"], [/(\d+) skipped/, "saltadas"]]
      .map(([re, txt]) => sum(re) ? ", " + sum(re) + " " + txt : "").join("");
    linea += " (" + sum(/(\d+) passed/) + " pruebas" + extra + ")";
  }
  if (omitidos.n) linea += " · omitidos " + omitidos.n + " (faltan en privado/datos_reales/: " + omitidos.faltan.join(", ") + ")";
  let n = malos.length;
  if (!res.length && !omitidos.n) { linea += " · ✗ no encuentra ningún test"; n++; }
  console.log(linea + " · el más lento " + s + " s");
  for (const r of malos) console.log("  ✗ " + r.nombre + "\n" + resumenFallo(r.salida));
  return n;
}
const sinOmitidos = { n: 0, faltan: [] };

// Servidor propio de la SPA en un puerto libre (los arneses lo leen de
// REENTAL_BASE). El http.server de Python solo deja 5 conexiones en cola: con varios
// Chrome a la vez rechaza algunas y los arneses ven errores de consola.
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
                ".json": "application/json", ".map": "application/json", ".csv": "text/csv; charset=utf-8",
                ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
                ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
                ".webmanifest": "application/manifest+json" };
function arrancarServidor() {
  const SPA = path.join(RAIZ, "Reental-SPA");
  const s = http.createServer((q, r) => {
    let ruta;
    try { ruta = decodeURIComponent(new URL(q.url, "http://x").pathname); }
    catch (e) { r.writeHead(400); r.end(); return; }
    const f = path.join(SPA, ruta.endsWith("/") ? ruta + "index.html" : ruta);
    if (!f.startsWith(SPA + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "Content-Type": TIPOS[path.extname(f).toLowerCase()] || "application/octet-stream",
                       "Cache-Control": "no-store" });
    fs.createReadStream(f).pipe(r);
  });
  return new Promise((fin, mal) => {
    s.on("error", mal);
    s.listen(0, "127.0.0.1", 511, () => {
      env.REENTAL_BASE = "http://127.0.0.1:" + s.address().port + "/";
      fin(s);
    });
  });
}

(async () => {
  await cogerCerrojo();
  const t0 = Date.now();
  let fallos = 0;

  // Sin Chrome: todo junto en el mismo grupo de hilos.
  const puros = lista(TESTS, /^test_.*\.js$/).map(f => trabajoNode(path.join(TESTS, f)));
  const paridades = lista(TESTS, /^paridad_.*\.js$/).map(f => path.join(TESTS, f));
  const par = paridades.map(f => trabajoNode(f));   // las que necesitan tus datos y no están salen OMITIDA
  // Con tus datos, las paridades leen tu copia local de las cifras: otra pasada
  // con la copia pública (la de Git), para que lo que se publica también se compruebe.
  const parPub = existeDato("config.json") ? paridades.map(f => trabajoNode(f, { CIFRAS_SOLO_GIT: "1" })) : [];
  const py = trabajosPytest(HILOS);
  const todos = await enPool([...py, ...par, ...parPub, ...puros], HILOS);
  const nPar = par.length + parPub.length;
  fallos += informar("Tests puros (Node)", todos.slice(py.length + nPar), sinOmitidos);
  fallos += informar("Paridades (cifras de referencia de la app)", todos.slice(py.length, py.length + par.length),
                     { n: 0, faltan: faltan(PRIV_PARIDAD) });
  if (parPub.length)
    fallos += informar("Paridades (copia pública de las cifras)",
                       todos.slice(py.length + par.length, py.length + nPar).filter(r => !r.omitido), sinOmitidos);
  fallos += informar("Python (pytest)", todos.slice(0, py.length), sinOmitidos);

  if (MODO === "completa") {
    if (!prepararNodePath()) {
      console.log("Arneses de navegador: ✗ NO se pueden correr (falta puppeteer-core; ver tests/navegador/README.md)");
      fallos++;
    } else {
      // Si Chrome tarda en cerrarse, se mata (ver cierre_rapido.js).
      env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--require "' + path.join(NAV, "cierre_rapido.js").split(path.sep).join("/") + '"'].filter(Boolean).join(" ");
      const servidor = await arrancarServidor();
      try {
        const arneses = lista(NAV, /^verify.*\.js$/);
        const reales = f => /_real\.js$/.test(f);
        const sint = arneses.filter(f => !reales(f)).map(f => trabajoNode(path.join(NAV, f)));
        // Los arneses con tus datos comprueban tus cifras: viven en privado/navegador/.
        const PRIV_NAV = path.join(RAIZ, "privado", "navegador");
        const conDatos = arneses.filter(reales).map(f => path.join(NAV, f))
          .concat(fs.existsSync(PRIV_NAV) ? lista(PRIV_NAV, /^verify.*_real\.js$/).map(f => path.join(PRIV_NAV, f)) : []);
        const faltanReales = faltan(PRIV_REALES);
        const real = faltanReales.length ? [] : conDatos.map(f => trabajoNode(f));
        const res = await enPool([...sint, ...real], HILOS_NAV);
        fallos += informar("Navegador, datos sintéticos", res.slice(0, sint.length), sinOmitidos);
        fallos += informar("Navegador, datos reales", res.slice(sint.length),
                           { n: faltanReales.length ? conDatos.length : 0, faltan: faltanReales });
      } finally {
        servidor.close();
      }
    }
  } else {
    console.log("(regresión corta: sin arneses de navegador)");
  }

  console.log((fallos ? "✗ " + fallos + " con fallos" : "✓ Todo en verde") + " · " +
              ((Date.now() - t0) / 1000).toFixed(0) + " s · salida entera en " + LOGS);
  process.exit(fallos ? 1 : 0);
})();
