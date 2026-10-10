/* Test: el lanzador de la regresión
 * (tests/navegador/regresion.js) ve cada fallo y no se pisa con otro.
 *
 * Monta proyectos falsos en una carpeta temporal, con una copia de
 * regresion.js, y corre su regresión corta:
 *  1. Cada forma de fallar sale en rojo y se ve: un test que se queda a
 *     medias y sale con 0, uno con FALLO y código 1 (se ve su línea FALLO),
 *     uno con FALLO y código 0 y un pytest que falla dentro de una
 *     subcarpeta. Una paridad sola (.js, sin .py) va,
 *     aunque nombre tus datos en un comentario; las que salen OMITIDA (77,
 *     lleva tus datos y no están) se omiten.
 *  2. Dos proyectos a la vez, cada uno con una paridad que escribe su
 *     nombre en la carpeta temporal: cada una lee la suya, no la del otro.
 *  3. Dos regresiones del mismo proyecto a la vez: la segunda espera.
 *
 * DATOS 100% SINTETICOS. Ejecución (desde la raíz del repo):
 *     node tests/test_regresion_paso_tests1.js
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const LANZADOR = path.join(__dirname, "navegador", "regresion.js");
const CASA = fs.mkdtempSync(path.join(os.tmpdir(), "tests1-"));

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

function proyecto(nombre, archivos) {
  const raiz = path.join(CASA, nombre);
  fs.mkdirSync(path.join(raiz, "tests", "navegador"), { recursive: true });
  fs.copyFileSync(LANZADOR, path.join(raiz, "tests", "navegador", "regresion.js"));
  for (const [f, txt] of Object.entries(archivos)) {
    fs.mkdirSync(path.dirname(path.join(raiz, f)), { recursive: true });
    fs.writeFileSync(path.join(raiz, f), txt);
  }
  return raiz;
}
function regresion(raiz) {
  return new Promise(fin => {
    const h = spawn(process.execPath, [path.join(raiz, "tests", "navegador", "regresion.js"), "corta"],
                    { cwd: raiz, env: Object.assign({}, process.env, { REGRESION_HILOS: "4", TEMP: CASA, TMP: CASA, TMPDIR: CASA }), windowsHide: true });
    let salida = "";
    h.stdout.on("data", d => { salida += d; });
    h.stderr.on("data", d => { salida += d; });
    h.on("close", codigo => fin({ codigo, salida }));
  });
}

const VERDE = 'console.log("RESULTADO: 1/1 — todo en verde");\n';
const PY_OK = "def test_ok():\n    assert True\n";
// Paridad: escribe su marca en la carpeta temporal y, un rato después,
// comprueba que lee esa misma marca.
const parJs = marca =>
  'const fs = require("fs"), path = require("path");\n' +
  'fs.mkdirSync(path.join(process.env.TEMP, "opencode"), { recursive: true });\n' +
  'fs.writeFileSync(path.join(process.env.TEMP, "opencode", "par.json"), JSON.stringify({ marca: "' + marca + '" }));\n' +
  "setTimeout(() => {\n" +
  '  const d = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, "opencode", "par.json"), "utf8"));\n' +
  '  if (d.marca !== "' + marca + '") { console.log("  FALLO leí la marca " + d.marca); process.exit(1); }\n' +
  "  " + VERDE + "}, 1500);\n";

(async () => {
  console.log("== 1. Cada forma de fallar sale en rojo ==");
  const p1 = proyecto("uno", {
    "tests/test_bien.js": VERDE,
    "tests/test_cuelga.js": 'console.log("  OK   antes");\nnew Promise(() => {}).then(() => console.log("nunca"));\n',
    "tests/test_fallo.js": 'console.log("  OK   a");\nconsole.error("  FALLO comprobación rota");\n' +
                           'for (let i = 0; i < 20; i++) console.log("  OK   relleno " + i);\n' +
                           'console.log("RESULTADO: 21/22 — HAY FALLOS");\nprocess.exit(1);\n',
    "tests/test_fallo0.js": 'console.error("  FALLO escondida");\nconsole.log("RESULTADO: 1/2 — todo en verde");\n',
    "tests/paridad_suelta.js": VERDE,
    // La que menciona tus datos en un comentario no se omite por eso.
    "tests/paridad_comenta.js": "// sin privado/datos_reales/reental_cache.json va igual\n" + VERDE,
    "tests/paridad_tuya.js": 'console.log("OMITIDA: lleva tus datos");\nprocess.exit(77);\n',
    "tests/paridad_tuya2.js": 'console.log("OMITIDA: lleva tus datos");\nprocess.exit(77);\n',
    "tests/test_bien.py": PY_OK,
    "tests/sub/test_sub_falla.py": "def test_x():\n    assert 1 == 2\n",
  });
  const r1 = await regresion(p1);
  const s = r1.salida;
  assert("sale con código 1", r1.codigo === 1, r1.codigo);
  assert("el test bueno, en verde", !s.includes("✗ tests/test_bien.js"));
  assert("el que se queda a medias y sale con 0, en rojo y dice por qué",
         s.includes("✗ tests/test_cuelga.js") && s.includes("se quedó a medias"));
  assert("del que falla se ve su línea FALLO aunque haya 20 OK detrás",
         s.includes("✗ tests/test_fallo.js") && s.includes("FALLO comprobación rota"));
  assert("FALLO con código 0, en rojo", s.includes("✗ tests/test_fallo0.js") && s.includes("tiene líneas FALLO"));
  assert("la paridad sola, sin .py, en verde", !s.includes("✗ tests/paridad_suelta"));
  assert("la que nombra tus datos en un comentario, corre y en verde", !s.includes("✗ tests/paridad_comenta") &&
         /Paridades \(cifras de referencia de la app\): 2\/2 en verde/.test(s));
  assert("las que salen OMITIDA, omitidas (no en rojo) y dice qué falta",
         !s.includes("✗ tests/paridad_tuya") && /omitidos 2 \(faltan en privado\/datos_reales\/: reental_cache\.json/.test(s));
  assert("pytest de una subcarpeta: corre, falla y se ve cuál",
         /\(1 pruebas, 1 fallan\)|\(\d+ pruebas, 1 fallan\)/.test(s) && s.includes("test_sub_falla"));
  assert("el resumen final no dice «Todo en verde»", !s.includes("Todo en verde"));

  console.log("== 2. Dos proyectos a la vez no se leen la carpeta temporal ==");
  const base = m => ({ "tests/test_bien.js": VERDE, "tests/test_ok.py": PY_OK,
                       "tests/paridad_par.js": parJs(m) });
  const [ra, rb] = await Promise.all([regresion(proyecto("a", base("a"))), regresion(proyecto("b", base("b")))]);
  assert("el proyecto A, en verde", ra.codigo === 0 && ra.salida.includes("Todo en verde"), ra.salida);
  assert("el proyecto B, en verde", rb.codigo === 0 && rb.salida.includes("Todo en verde"), rb.salida);

  console.log("== 3. Dos regresiones del mismo proyecto: la segunda espera ==");
  const pc = proyecto("c", { "tests/test_lento.js": "setTimeout(() => { " + VERDE + "}, 2500);\n",
                             "tests/test_ok.py": PY_OK,
                             "tests/paridad_par.js": parJs("c") });
  const [c1, c2] = await Promise.all([regresion(pc), new Promise(r => setTimeout(r, 300)).then(() => regresion(pc))]);
  assert("las dos en verde", c1.codigo === 0 && c2.codigo === 0, [c1.salida, c2.salida]);
  assert("una avisa de que espera a la otra", (c1.salida + c2.salida).includes("esperando a que acabe otra regresión"));

  fs.rmSync(CASA, { recursive: true, force: true });
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})();
