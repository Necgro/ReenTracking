/* Regrabar las cifras de referencia de la app (tests/cifras_referencia.js).
 *
 *   node tests/regrabar_cifras.js [parte del nombre]
 *     Enseña qué cambia: pasa esas paridades (todas sin nombre) y saca TODAS
 *     sus diferencias con lo grabado (un resumen por ruta al final de cada
 *     una). Con tus datos de privado/datos_reales/ cambiados, compara igual y
 *     lo avisa. No graba nada.
 *   node tests/regrabar_cifras.js [parte del nombre] --grabar
 *     Si el cambio es el buscado: graba lo de ahora como referencia, en Git (sin
 *     tus datos) y, si están tus datos, también en la local. Solo si todas
 *     salen bien en los dos sitios; si una falla, no se graba ninguna.
 *
 * Una paridad va bien si sale con 0, sin líneas FALLO y con su línea «en
 * verde» al final (como en tests/navegador/regresion.js: si no, se quedó a
 * medias).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { huellasDatos, OMITIDA, LOCAL, GIT } = require("./cifras_referencia.js");

const RAIZ = path.join(__dirname, "..");
const grabar = process.argv.includes("--grabar");
const filtro = process.argv.slice(2).find(a => a !== "--grabar") || "";
const todas = fs.readdirSync(__dirname).filter(f => /^paridad_.*\.js$/.test(f)).sort();
const paridades = todas.filter(f => f.includes(filtro));
if (!paridades.length) { console.log("Ninguna paridad con «" + filtro + "» en el nombre."); process.exit(1); }
const conDatos = fs.existsSync(path.join(__dirname, "..", "privado", "datos_reales", "config.json"));
const carpetas = [GIT].concat(conDatos ? [LOCAL] : []);
const nuevos = () => carpetas.flatMap(c => (fs.existsSync(c) ? fs.readdirSync(c) : [])
  .filter(f => f.endsWith(".gz.nuevo")).map(f => path.join(c, f)));

function pasar(f, env) {
  const r = spawnSync(process.execPath, [path.join("tests", f)], { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 28,
    env: Object.assign({}, process.env, { REGRABAR: "", CIFRAS_VER: "", CIFRAS_SOLO_GIT: "" }, env) });
  const salida = (r.stdout || "") + (r.stderr || "");
  const ultima = salida.split(/\r?\n/).filter(l => l.trim() && !/^(RESUMEN|AVISO|  \d+ × )/.test(l)).pop() || "";
  const bien = r.status === 0 && !/^\s*FALLO\b/m.test(salida) && /verde|\b0 fallo/i.test(ultima);
  return { codigo: r.status, bien, salida: salida + (r.status === 0 && !bien ? "\n(terminó sin su línea en verde: se quedó a medias)" : "") };
}
const sangrar = (t, n) => t.trim().split("\n").slice(-n).map(l => "    " + l).join("\n");

let malas = 0, conAviso = 0;
for (const f of nuevos()) fs.rmSync(f);   // restos de una vez anterior
for (const f of paridades) {
  if (!grabar) {
    const r = pasar(f, { CIFRAS_VER: "1" });
    if (r.codigo === OMITIDA) { console.log("omitida " + f); continue; }
    if (r.bien && !/^AVISO /m.test(r.salida)) { console.log("igual   " + f); continue; }
    if (!r.bien) malas++; else conAviso++;
    console.log((r.bien ? "igual   " : "CAMBIA  ") + f + "\n" + sangrar(r.salida, 400));
    continue;
  }
  // La de Git (sin tus datos) y, si están, la local.
  for (const modo of [{ CIFRAS_SOLO_GIT: "1" }].concat(conDatos ? [{}] : [])) {
    const r = pasar(f, Object.assign({ REGRABAR: "1" }, modo));
    const donde = modo.CIFRAS_SOLO_GIT ? "Git  " : "local";
    if (r.codigo === OMITIDA) console.log("omitida " + donde + " " + f + " (lleva tus datos)");
    else if (r.bien) console.log("lista   " + donde + " " + f);
    else { malas++; console.log("FALLO   " + donde + " " + f + "\n" + sangrar(r.salida, 12)); }
  }
}
if (grabar && malas) {
  for (const f of nuevos()) fs.rmSync(f);
  console.log("\n" + malas + " con fallo: no se graba ninguna.");
  process.exit(1);
}
if (grabar) {
  const fecha = new Date().toISOString().slice(0, 16).replace("T", " ");
  for (const f of nuevos()) fs.renameSync(f, f.slice(0, -".nuevo".length));
  for (const c of carpetas) {
    const ruta = path.join(c, "version.json");
    let version = {};
    try { version = JSON.parse(fs.readFileSync(ruta, "utf8")); } catch (e) { /* nueva */ }
    version.fecha = fecha;
    if (c === GIT) version.archivos = fs.readdirSync(GIT).filter(f => f.endsWith(".gz")).map(f => f.slice(0, -3)).sort();
    // Tus datos: solo con todas grabadas (con algunas, las demás siguen
    // siendo de la copia de antes).
    if (c === LOCAL && (paridades.length === todas.length || !version.datos_reales)) version.datos_reales = huellasDatos();
    fs.writeFileSync(ruta, JSON.stringify(version, null, 1) + "\n");
  }
  console.log("\nGrabadas.");
  process.exit(0);
}
const orden = "node tests/regrabar_cifras.js " + (filtro ? filtro + " " : "") + "--grabar";
console.log(malas ? "\n" + malas + " paridades cambian. Si es a propósito y el usuario lo aprueba: " + orden
  : conAviso ? "\nNada cambia, pero tus datos de privado/datos_reales/ sí: para darlos por buenos, " + orden : "\nNada cambia.");
process.exit(malas ? 1 : 0);
