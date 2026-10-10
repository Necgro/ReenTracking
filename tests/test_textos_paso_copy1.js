/* Test: los textos que ve el usuario en js/10, 14, 15, 16 y 18 no citan
 * pestañas ni botones que ya no existen ni jerga interna (nombres de
 * variables, fases o decisiones del plan, archivos que la app ya no usa).
 *
 * Método: se extraen los LITERALES de texto de cada módulo (comillas simples,
 * dobles y plantillas), dejando fuera los comentarios, y se buscan patrones
 * prohibidos. Los comentarios no se miran: son para quien programa. También se comprueba que las pestañas y botones que
 * los textos citan ahora existen de verdad en index.html.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_textos_paso_copy1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..", "Reental-SPA");
const MODULOS = ["10-csv-descubrimiento.js", "14-clasificador.js", "15-correcciones.js",
  "16-dashboard.js", "18-transacciones.js"];

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

/* Literales de texto de un fuente JS, sin comentarios. Tokenizador mínimo:
   distingue comentarios, cadenas y plantillas; las expresiones regulares del
   código no llevan comillas ni barras dobles en estos módulos, y si las
   llevaran solo producirían literales de más (más estricto, nunca menos). */
function literales(fuente) {
  const out = [];
  let i = 0;
  const n = fuente.length;
  while (i < n) {
    const c = fuente[i], d = fuente[i + 1];
    if (c === "/" && d === "/") { while (i < n && fuente[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const f = fuente.indexOf("*/", i + 2); i = f < 0 ? n : f + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1, txt = "";
      while (j < n && fuente[j] !== c) {
        if (fuente[j] === "\\") { txt += fuente[j + 1]; j += 2; continue; }
        if (c !== "`" && fuente[j] === "\n") break; // no es una cadena (p. ej. un apóstrofo en una regex)
        txt += fuente[j]; j++;
      }
      out.push({ txt, linea: fuente.slice(0, i).split("\n").length });
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

/* Lo prohibido en los textos. Cada patrón con el porqué. */
const PROHIBIDOS = [
  [/🛠️/, "la pestaña 🛠️ Panel/Revisión ya no existe: es 🔍 Revisión"],
  [/🧮 Clasificaci/, "la pestaña 🧮 Clasificación ya no existe"],
  [/⚙️ Config(?!uraci)/, "la pestaña ⚙️ Config se fusionó en 🚀 Puesta en marcha (la tarjeta «⚙️ Configuración» sí existe)"],
  [/Clasificar transacciones/, "ya no hay botón de clasificar: se clasifica solo"],
  [/Preparar y clasificar|▶ Iniciar|Solo clasificar|Solo sincronizar/, "botones retirados"],
  [/Ir a Sincronizaci/, "la pestaña 🔄 Sincronización ya no existe"],
  [/^#(config|sync|clasificacion|panel)$/, "dirección antigua: el enlace debe ir a la pestaña actual"],
  [/state\.\w+/, "nombre de variable interna"],
  [/cache\.(pagos_diferidos|tipos_bce|precios_rnt|catalogo_propiedades|ajustes_usuario)/, "nombre interno de la cache"],
  [/reental_datos\.json/, "archivo que la app ya no usa"],
  [/\bFase [0-9]/, "fase del plan"],
  // «(paso 1)» sí vale: son los números de las tarjetas de 🚀 Puesta en marcha.
  [/\((?:§\d+, )?D[0-9]\)|\bD[0-9]:|\bDU-[0-9]|\(paso [0-9]+\.[0-9]|\([0-9]\.[0-9]+\)|§[0-9]/, "código de decisión o paso del plan"],
  [/revisar=true/, "jerga de campo interno"],
  [/CSV de dividendos|CSV oficial de dividendos|CSV de distribuciones/, "el archivo se llama «de rendimientos» (T54 y glosario REND)"],
  [/«Abrir mi cache»|«📂 Abrir mi cache»/, "el botón se llama «📂 Abrir mi reental_cache.json» (UI-7d)"],
  [/js\/1[0-9]-/, "nombre de archivo del código"],
];

console.log("A) Sin referencias obsoletas ni jerga en los textos");
let totalLiterales = 0;
for (const m of MODULOS) {
  const fuente = fs.readFileSync(path.join(BASE, "js", m), "utf8");
  const lits = literales(fuente);
  totalLiterales += lits.length;
  const hallazgos = [];
  for (const l of lits) {
    // Prefijos de console.error («Dashboard (js/16-dashboard.js):»): van a la
    // consola del desarrollador, no los ve el usuario.
    if (/^[\wÁ-ú ]+\(js\/[\w-]+\.js\):$/.test(l.txt)) continue;
    for (const [re, motivo] of PROHIBIDOS) {
      if (re.test(l.txt)) hallazgos.push(m + ":" + l.linea + " «" + l.txt.slice(0, 70) + "» — " + motivo);
    }
  }
  assert("js/" + m + ": " + lits.length + " textos, ninguno obsoleto ni con jerga", hallazgos.length === 0, hallazgos);
}
assert("el tokenizador encuentra textos de verdad (control)", totalLiterales > 500, totalLiterales);
assert("el tokenizador ignora comentarios (control)",
  literales("// «🛠️ Panel»\n/* Fase 5 */ const a = \"hola\";").map(l => l.txt).join() === "hola");

/* index.html: el texto visible (sin comentarios, estilos ni scripts), que
   también tiene títulos y ayudas. «🛠️» sí se veta aquí: ya no es el icono
   de nada. */
const html = fs.readFileSync(path.join(BASE, "index.html"), "utf8");
const visible = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
const enHtml = PROHIBIDOS.filter(([re]) => !re.source.startsWith("^")).map(([re, motivo]) => {
  const m = visible.match(new RegExp(re.source));
  return m ? "«" + visible.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, " ") + "» — " + motivo : null;
}).filter(Boolean);
assert("index.html: el texto visible tampoco tiene referencias obsoletas ni jerga", enHtml.length === 0, enHtml);
assert("index.html: los precios de RNT ya no prometen que quitan registros de REVISAR (falso: la clasificación no usa precios)",
  !/dejarán de marcarse REVISAR/.test(visible) && /las fechas sin precio se ponen a mano/i.test(visible)); // textos de Revisión simplificados

console.log("B) Lo que citan los textos existe");
const nav = (html.match(/id="navPrincipal"[\s\S]*?<\/nav>/) || [""])[0];
for (const [pestana, href] of [["🔍", "#revision"], ["🚀", "#inicio"], ["📒", "#transacciones"], ["📊", "#dashboard"]]) {
  assert("la pestaña " + pestana + " existe en el menú (" + href + ")", nav.includes('href="' + href + '"') && nav.includes(pestana));
}
const todos = MODULOS.map(m => fs.readFileSync(path.join(BASE, "js", m), "utf8")).join("\n");
const js19 = fs.readFileSync(path.join(BASE, "js", "19-arranque.js"), "utf8");
assert("«📂 Abrir copia» es el botón de verdad (ALMACEN-1)", html.includes(">📂 Abrir copia</button>"));
assert("«🔄 Actualizar» es el botón de verdad", html.includes(">🔄 Actualizar</button>") && js19.includes('"🔄 Actualizar"'));
assert("los textos que citan «🔄 Actualizar» y «📂 Abrir copia» lo hacen con el nombre exacto",
  /«🔄 Actualizar»/.test(todos + js19) && /«📂 Abrir copia»/.test(todos + js19) &&
  !/«📂 Abrir mi reental_cache\.json»/.test((todos + js19).replace(/\/\*[\s\S]*?\*\//g, "")));  // los comentarios no cuentan; el del vault no está en js/16
/* En 📒 Transacciones es un icono 🔗 cuya burbuja
   dice «Vincular cobro…»; en las cards de 🔍 Revisión sigue con su texto. */
assert("«🔗 Vincular cobro…» (el que citan las ayudas) es el botón de las salidas",
  /"🔗 Vincular cobro…"\)/.test(todos) && /txBotonIcono\("🔗", "Vincular cobro…"/.test(todos));
assert("la tabla «Catálogo de inmuebles» que cita el aviso de tokens existe en Revisión",
  /Catálogo de inmuebles/.test(html) && html.includes('id="tablaCatalogo"'));
const enlaces = [...todos.matchAll(/href:\s*"(#[a-z]+)"/g)].map(x => x[1]);
const vistas = [...html.matchAll(/<section id="view-([a-z]+)"/g)].map(x => "#" + x[1]);
assert("todos los enlaces de los avisos del Panel llevan a una pestaña que existe",
  enlaces.length > 0 && enlaces.every(e => vistas.includes(e)), { enlaces, vistas });

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
