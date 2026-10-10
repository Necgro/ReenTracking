/* Test de tests/cifras_referencia.js (los casos y las cifras de
 * referencia de la app que leen las paridades) y tests/regrabar_cifras.js,
 * en proyectos falsos:
 *  - sin tus datos: lo de Git se lee; lo que no está en Git se omite (77),
 *    pero si version.json dice que está en Git y falta, FALLO;
 *  - con tus datos: siempre la copia local; sin ella, FALLO; si tus datos
 *    cambiaron, FALLO; version.json roto, FALLO claro, sin traza;
 *  - referencia: igual, sin diferencias; una cifra, un texto o un campo de
 *    más, con su ruta; NaN, infinitos y Map, como se graban; lo que JSON
 *    no guarda (Set, Map con claves que se pisan), para (A10);
 *  - REGRABAR suelto: deja lo de la app en «.nuevo» sin las entradas que
 *    la app cambió; si la prueba falla, nada; un caso muy hondo, FALLO de
 *    la prueba (A11);
 *  - regrabar_cifras.js: sin --grabar enseña TODO lo que cambia (A1) y no
 *    graba; con --grabar graba la de Git y la local, y nada si una se queda
 *    a medias (A2) o falla en un sitio (A4); con tus datos cambiados avisa y
 *    enseña lo que cambia (A3) y, grabadas todas, valen (A12);
 *  - con tus datos, la copia de Git igual que la local (A4).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz del repo):
 *     node tests/test_cifras_referencia_paso_pyzip1.js
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { diferencias, comoGrabado } = require("./cifras_referencia.js");

const CASA = fs.mkdtempSync(path.join(os.tmpdir(), "pyzip1-"));
let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const gz = v => zlib.gzipSync(JSON.stringify(v));
const leerGz = ruta => JSON.parse(zlib.gunzipSync(fs.readFileSync(ruta)));
const DATOS = { "config.json": '{"wallet":"0x1"}', "reental_cache.json": "{}", "reental_rendimientos.csv": "a,b\n" };

/* Un proyecto falso: lo de Git y, si se pide, tus datos con su copia local. */
function proyecto(nombre, { git = {}, local = null, datos = null, versionLocal } = {}) {
  const raiz = path.join(CASA, nombre);
  const t = path.join(raiz, "tests");
  fs.mkdirSync(path.join(t, "cifras_referencia"), { recursive: true });
  for (const f of ["cifras_referencia.js", "regrabar_cifras.js"]) fs.copyFileSync(path.join(__dirname, f), path.join(t, f));
  for (const [n, v] of Object.entries(git)) fs.writeFileSync(path.join(t, "cifras_referencia", n + ".gz"), gz(v));
  fs.writeFileSync(path.join(t, "cifras_referencia", "version.json"), JSON.stringify({ archivos: Object.keys(git) }));
  if (datos) {
    const d = path.join(raiz, "privado", "datos_reales");
    fs.mkdirSync(path.join(d, "cifras_referencia"), { recursive: true });
    for (const [n, v] of Object.entries(datos)) fs.writeFileSync(path.join(d, n), v);
    for (const [n, v] of Object.entries(local || {})) fs.writeFileSync(path.join(d, "cifras_referencia", n + ".gz"), gz(v));
    const usados = Object.fromEntries(Object.entries(datos).map(([n, v]) => [n, sha(Buffer.from(v))]));
    fs.writeFileSync(path.join(d, "cifras_referencia", "version.json"),
      versionLocal !== undefined ? versionLocal : JSON.stringify({ datos_reales: usados }));
  }
  return raiz;
}
function nodo(raiz, codigo, env = {}) {
  const r = spawnSync(process.execPath, ["-e", codigo], { cwd: raiz, encoding: "utf8",
    env: Object.assign({}, process.env, { REGRABAR: "", CIFRAS_SOLO_GIT: "" }, env) });
  return { codigo: r.status, salida: r.stdout + r.stderr };
}
const MOD = raiz => JSON.stringify(path.join(raiz, "tests", "cifras_referencia.js"));
const leer = (raiz, nombre, env) => nodo(raiz, "const { leerCasos } = require(" + MOD(raiz) + ");" +
  "console.log('LEIDO ' + JSON.stringify(leerCasos(" + JSON.stringify(nombre) + ")));", env);
const leido = (r, v) => r.codigo === 0 && r.salida.includes("LEIDO " + JSON.stringify(v));
const falla = (r, txt) => r.codigo === 2 && /^FALLO /m.test(r.salida) && r.salida.includes(txt) && !/\n\s+at /.test(r.salida);

console.log("== Sin tus datos ==");
const sinDatos = proyecto("sin", { git: { "p_git.json": { sinteticos: [1] } } });
assert("lo de Git se lee", leido(leer(sinDatos, "p_git.json"), { sinteticos: [1] }));
const omit = leer(sinDatos, "p_tuyo.json");
assert("lo que no está en Git se omite (77)", omit.codigo === 77 && omit.salida.includes("OMITIDA"), omit);
fs.rmSync(path.join(sinDatos, "tests", "cifras_referencia", "p_git.json.gz"));
assert("si version.json dice que está en Git y falta: FALLO, no OMITIDA", falla(leer(sinDatos, "p_git.json"), "falta p_git.json"));

console.log("== Con tus datos ==");
const conDatos = proyecto("con", { git: { "p.json": { sinteticos: [1] } }, local: { "p.json": { sinteticos: [1, 2] } }, datos: DATOS });
assert("se lee la copia local (con tus casos)", leido(leer(conDatos, "p.json"), { sinteticos: [1, 2] }));
assert("con CIFRAS_SOLO_GIT=1, la de Git", leido(leer(conDatos, "p.json", { CIFRAS_SOLO_GIT: "1" }), { sinteticos: [1] }));
const sinLocal = proyecto("sinlocal", { git: { "p.json": { sinteticos: [1] } }, local: {}, datos: DATOS });
assert("sin la copia local: FALLO (no cae a la de Git)", falla(leer(sinLocal, "p.json"), "falta p.json en privado/datos_reales"));
const otroCsv = proyecto("csv", { local: { "p.json": 1 }, datos: DATOS });
fs.appendFileSync(path.join(otroCsv, "privado", "datos_reales", "reental_rendimientos.csv"), "c,d\r\n");
assert("tu CSV cambiado: FALLO", falla(leer(otroCsv, "p.json"), "reental_rendimientos.csv"));
const crlf = proyecto("crlf", { local: { "p.json": 1 }, datos: DATOS });
fs.writeFileSync(path.join(crlf, "privado", "datos_reales", "reental_rendimientos.csv"), "a,b\r\n");
assert("el mismo CSV con CRLF: la misma huella", leido(leer(crlf, "p.json"), 1));
const nuevoCsv = proyecto("csv2", { local: { "p.json": 1 }, datos: DATOS });
fs.writeFileSync(path.join(nuevoCsv, "privado", "datos_reales", "reental_dividendos.csv"), "x\n");
assert("un CSV que no estaba al grabar: FALLO", falla(leer(nuevoCsv, "p.json"), "reental_dividendos.csv"));
assert("version.json local roto: FALLO claro",
  falla(leer(proyecto("v1", { local: { "p.json": 1 }, datos: DATOS, versionLocal: "{roto" }), "p.json"), "version.json"));
assert("version.json local sin la huella de tus datos: FALLO claro",
  falla(leer(proyecto("v2", { local: { "p.json": 1 }, datos: DATOS, versionLocal: "{}" }), "p.json"), "cambiaron"));

console.log("== referencia y diferencias ==");
assert("igual: sin diferencias", diferencias({ a: [1, "x", null] }, comoGrabado({ a: [1, "x", undefined] })).length === 0);
assert("una cifra distinta, con su ruta", JSON.stringify(diferencias({ r: [{ gp: 1 }] }, { r: [{ gp: 2 }] })) === '[".r.0.gp: antes 1 · ahora 2"]');
assert("un texto distinto cuenta (también los textos)", diferencias({ nota: "a" }, { nota: "b" }).length === 1);
assert("un campo de más cuenta, aunque el otro lo tenga a null", JSON.stringify(diferencias({ a: 1, b: null }, { a: 1 })) === '[".b: solo antes"]');
assert("NaN e infinitos, como se graban", diferencias({ x: NaN, y: Infinity, z: -Infinity }, comoGrabado({ x: NaN, y: Infinity, z: -Infinity })).length === 0);
assert("un Map, como objeto", JSON.stringify(comoGrabado(new Map([[1, "a"]]))) === '{"1":"a"}');

const lanza = f => { try { f(); return false; } catch (e) { return true; } };
assert("A10: un Set no se graba como vacío: para", lanza(() => comoGrabado({ s: new Set([1]) })));
assert("A10: un Map con las claves 1 y «1» (se pisarían): para", lanza(() => comoGrabado(new Map([[1, "a"], ["1", "b"]]))));
assert("A10: un Map con una clave objeto: para", lanza(() => comoGrabado(new Map([[{}, "a"]]))));

console.log("== REGRABAR (una paridad suelta) ==");
const reg = proyecto("reg", { git: { "p.json": { casos: [{ entrada: [3, 1, 2], salida: "de antes" }], hondo: { a: { b: [{ salida: 1 }] } } } } });
const PRUEBA = "const { leerCasos, referencia } = require(" + MOD(reg) + ");" +
  "const d = leerCasos('p.json'); const c = d.casos[0]; const ent = c.entrada.sort();" +
  "const difs = referencia(c, 'salida', { suma: ent.reduce((a, b) => a + b), nan: NaN });" +
  "console.log(difs.length ? 'DISTINTO ' + difs.join('|') : 'IGUAL'); process.exit(process.env.ROMPER ? 1 : difs.length ? 1 : 0);";
const rutaGit = path.join(reg, "tests", "cifras_referencia", "p.json.gz");
assert("sin REGRABAR: enseña lo que cambia", /DISTINTO : antes "de antes"/.test(nodo(reg, PRUEBA).salida));
nodo(reg, PRUEBA, { REGRABAR: "1", ROMPER: "1" });
assert("REGRABAR con la prueba en rojo: no deja nada", !fs.existsSync(rutaGit + ".nuevo"));
const r = nodo(reg, PRUEBA, { REGRABAR: "1" });
assert("REGRABAR suelto: no toca lo grabado (lo pone en su sitio regrabar_cifras.js)", leerGz(rutaGit).casos[0].salida === "de antes");
const nuevo = fs.existsSync(rutaGit + ".nuevo") ? leerGz(rutaGit + ".nuevo").casos[0] : {};
assert("REGRABAR: deja lo de la app en «.nuevo»", r.codigo === 0 && nuevo.salida && nuevo.salida.suma === 6 && nuevo.salida.nan.__float__ === "nan", { r, nuevo });
assert("REGRABAR: no graba la entrada que la app cambió (sort)", JSON.stringify(nuevo.entrada) === "[3,1,2]", nuevo);
const hondo = nodo(reg, "const { leerCasos, referencia } = require(" + MOD(reg) + ");" +
  "const d = leerCasos('p.json'); try { referencia(d.hondo.a.b[0], 'salida', 2); } catch (e) { console.log('error en la app'); }", { REGRABAR: "1" });
assert("A11: un caso más hondo de 3 niveles: FALLO de la prueba (no «error en la app»)",
  falla(hondo, "más hondo") && !hondo.salida.includes("error en la app"), hondo);

console.log("== regrabar_cifras.js ==");
/* Un proyecto con una paridad falsa: compara cada caso con el número de
   valor.txt; «colgada» acaba sin su línea en verde; «local_mal» falla al
   grabar la local. */
function conParidad(nombre, { variante = "", casosGit = 1, casosLocal = 1 } = {}) {
  const casos = n => ({ casos: Array.from({ length: n }, () => ({ salida: { x: 1 } })) });
  const raiz = proyecto(nombre, { git: { "p.json": casos(casosGit) }, local: { "p.json": casos(casosLocal) }, datos: DATOS });
  fs.writeFileSync(path.join(raiz, "tests", "valor.txt"), "1");
  fs.writeFileSync(path.join(raiz, "tests", "paridad_p.js"), "const { leerCasos, referencia } = require('./cifras_referencia.js');" +
    "const d = leerCasos('p.json'); const v = Number(require('fs').readFileSync(__dirname + '/valor.txt', 'utf8'));" +
    "const difs = [].concat(...d.casos.map(c => referencia(c, 'salida', { x: v })));" +
    (variante === "local_mal" ? "if (process.env.REGRABAR && !process.env.CIFRAS_SOLO_GIT) process.exit(1);" : "") +
    "if (difs.length) { console.log('FALLO'); console.log(difs[0]); process.exit(1); }" +
    (variante === "colgada" ? "" : "console.log('RESULTADO: verde');"));
  return raiz;
}
const regrabar = (raiz, args) => spawnSync(process.execPath, [path.join("tests", "regrabar_cifras.js"), ...args], { cwd: raiz, encoding: "utf8",
  env: Object.assign({}, process.env, { REGRABAR: "", CIFRAS_SOLO_GIT: "", CIFRAS_VER: "" }) });
const gzDe = (raiz, local) => path.join(raiz, ...(local ? ["privado", "datos_reales"] : ["tests"]), "cifras_referencia", "p.json.gz");
const sinNuevos = raiz => ![gzDe(raiz, false), gzDe(raiz, true)].some(f => fs.existsSync(f + ".nuevo"));

const orden = conParidad("orden", { casosGit: 10, casosLocal: 12 });
fs.writeFileSync(path.join(orden, "tests", "valor.txt"), "9");
const muestra = regrabar(orden, ["p"]);
assert("sin --grabar: dice qué cambia y no graba", muestra.status === 1 && /CAMBIA +paridad_p\.js/.test(muestra.stdout) &&
  leerGz(gzDe(orden, true)).casos[0].salida.x === 1 && sinNuevos(orden), muestra.stdout);
assert("A1: enseña TODAS las diferencias (las 12, por ruta), aunque la paridad solo saque una",
  muestra.stdout.includes("RESUMEN de todo lo que cambia (12 diferencias)") && /12 × \.x — p\. ej\. antes 1 · ahora 9/.test(muestra.stdout), muestra.stdout);
const graba = regrabar(orden, ["p", "--grabar"]);
assert("con --grabar: la de Git y la local, sin restos", graba.status === 0 && leerGz(gzDe(orden, false)).casos.every(c => c.salida.x === 9) &&
  leerGz(gzDe(orden, true)).casos.every(c => c.salida.x === 9) && sinNuevos(orden), graba.stdout);
assert("y luego nada cambia", regrabar(orden, []).stdout.includes("Nada cambia."));

const colgada = conParidad("colgada", { variante: "colgada" });
const vista = regrabar(colgada, []);
fs.writeFileSync(path.join(colgada, "tests", "valor.txt"), "9");
assert("A2: una que sale con 0 sin su línea en verde no es «igual»", vista.status === 1 && vista.stdout.includes("se quedó a medias"), vista.stdout);
const intento = regrabar(colgada, ["--grabar"]);
assert("A2: y con --grabar no se graba nada", intento.status === 1 && intento.stdout.includes("no se graba ninguna") &&
  leerGz(gzDe(colgada, false)).casos[0].salida.x === 1 && leerGz(gzDe(colgada, true)).casos[0].salida.x === 1 && sinNuevos(colgada), intento.stdout);

const localMal = conParidad("localmal", { variante: "local_mal" });
fs.writeFileSync(path.join(localMal, "tests", "valor.txt"), "9");
const medio = regrabar(localMal, ["--grabar"]);
assert("A4: si la local falla, tampoco se graba la de Git (no se quedan distintas)", medio.status === 1 &&
  leerGz(gzDe(localMal, false)).casos[0].salida.x === 1 && sinNuevos(localMal), medio.stdout);

const datosNuevos = conParidad("datos");
fs.appendFileSync(path.join(datosNuevos, "privado", "datos_reales", "reental_rendimientos.csv"), "c,d\n");
fs.writeFileSync(path.join(datosNuevos, "tests", "valor.txt"), "7");
const paridad = () => spawnSync(process.execPath, [path.join("tests", "paridad_p.js")], { cwd: datosNuevos, encoding: "utf8",
  env: Object.assign({}, process.env, { REGRABAR: "", CIFRAS_SOLO_GIT: "", CIFRAS_VER: "" }) });
const sola = paridad();
assert("A3: con tus datos cambiados, la paridad sola falla y dice cómo verlo", sola.status !== 0 && (sola.stdout + sola.stderr).includes("regrabar_cifras.js enseña"));
const conAviso = regrabar(datosNuevos, []);
assert("A3: regrabar_cifras.js avisa de tus datos Y enseña lo que cambia", conAviso.status === 1 &&
  conAviso.stdout.includes("AVISO tus datos") && conAviso.stdout.includes("antes 1 · ahora 7"), conAviso.stdout);
fs.writeFileSync(path.join(datosNuevos, "tests", "valor.txt"), "1");
assert("A3: si solo cambiaron tus datos, lo dice", regrabar(datosNuevos, []).stdout.includes("Nada cambia, pero tus datos"));
regrabar(datosNuevos, ["paridad_", "--grabar"]);
const tras = paridad();
assert("A12: grabadas todas (con un filtro que las coge todas), tus datos nuevos valen", tras.status === 0, tras.stdout + tras.stderr);

console.log("== La copia de Git cuadra con la local (A4) ==");
/* Con tus datos, la regresión solo pasa la local: aquí, que cada caso de
   la de Git sea igual que el de la local con el mismo nombre (o, sin
   nombre, el mismo bloque). */
const { GIT: CARPETA_GIT, LOCAL: CARPETA_LOCAL } = require("./cifras_referencia.js");
if (!fs.existsSync(path.join(__dirname, "..", "privado", "datos_reales", "config.json"))) console.log("  (sin tus datos: no hay local con que comparar)");
else {
  const distintos = [];
  const archivos = fs.readdirSync(CARPETA_GIT).filter(x => x.endsWith(".gz"));
  for (const f of archivos) {
    const g = leerGz(path.join(CARPETA_GIT, f)), l = leerGz(path.join(CARPETA_LOCAL, f));
    for (const [k, v] of Object.entries(g)) {
      const conNombre = Array.isArray(v) && v.every(c => c && c.nombre);
      // Un nombre puede repetirse (varias llamadas del mismo test): por nombre y en orden.
      const porNombre = lista => lista.reduce((m, c) => m.set(c.nombre, (m.get(c.nombre) || []).concat([c])), new Map());
      const deLocal = conNombre ? porNombre(l[k] || []) : null;
      const malos = conNombre ? [...porNombre(v)].filter(([n, cs]) => JSON.stringify(cs) !== JSON.stringify(deLocal.get(n)))
        : JSON.stringify(v) !== JSON.stringify(l[k]) ? [k] : [];
      if (malos.length) distintos.push(f + "." + k + " (" + malos.length + ")");
    }
  }
  assert("los " + archivos.length + " archivos de Git, iguales a la local", archivos.length >= 12 && distintos.length === 0, distintos);
}

fs.rmSync(CASA, { recursive: true, force: true });
console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
