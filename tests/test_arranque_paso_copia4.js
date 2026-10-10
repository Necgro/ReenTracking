/* Test de «🧹 Olvidar todo en este navegador» en 🚀.
 *
 * Bajo prueba (Reental-SPA/js/19-arranque.js, arrOlvidarTodo):
 * - Pregunta con un diálogo (#arrDlgOlvidar) que, con datos,
 *   ofrece guardar una copia antes; «Cancelar» (o Esc) no borra nada ni
 *   recarga; «Guardar copia y olvidar» descarga la copia y luego olvida, y
 *   si la copia no se hace, no olvida.
 * - «Sí»: borra las claves de la app en localStorage (las de otras
 *   herramientas, que comparten el almacén al abrirse con doble clic, no),
 *   lo recordado en IndexedDB y recarga.
 * - Cada clave «reental_» que escribe la app está en la lista que se borra.
 *   Tu archivo no se escribe.
 * - Si IndexedDB o localStorage fallan, recarga igual.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_arranque_paso_copia4.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const elementos = {};
const elemento = id => (elementos[id] = elementos[id] || {
  id, value: "", disabled: false, hidden: false, open: false, innerHTML: "", textContent: "",
  dataset: {}, style: {}, children: [],
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(h) { this.children.push(h); }, setAttribute() {}, querySelector() { return null; },
});
// El diálogo (index.html): showModal «pulsa» el botón de `respuesta` (el valor del botón, o null = Esc).
const formulario = {};
Object.assign(elemento("arrDlgOlvidar"), {
  querySelector: q => (q === "form" ? formulario : null),
  showModal() { preguntas.push(elemento("arrDlgCopia").hidden ? "sin copia" : "con copia");
    if (respuesta === null) this.oncancel(); else formulario.onsubmit({ submitter: { value: respuesta } }); },
});
// Como el de verdad: Object.keys(localStorage) da las claves guardadas.
class Almacen {
  getItem(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; }
  setItem(k, v) { this[k] = String(v); }
  removeItem(k) { delete this[k]; }
}
const sb = {
  console: Object.assign({}, console, { error: () => {} }),
  document: { getElementById: elemento, createElement: () => ({ className: "", textContent: "" }) },
  localStorage: new Almacen(),
  setTimeout, clearTimeout, Promise, Date, JSON, Math, Object, Array, Set, Map, BigInt,
};
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "12-carga-archivos.js", "14-clasificador.js", "24-exportar.js", "19-arranque.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
const STATE = vm.runInContext("state", sb);

const olvidandoAlBorrar = [];
let preguntas = [], respuesta = "olvidar", recargas = 0, borradas = [], escrituras = 0, copias = [], copiaSale = true;
// Lo recordado en IndexedDB: se vacía con idbOperar (js/03), que aquí se sustituye.
const idb = modo => async (m, operacion) => {
  if (modo === "falla") throw new Error("sin IndexedDB");
  // Al vaciar, nada puede volver a guardar.
  operacion({ clear: () => { borradas.push(m); olvidandoAlBorrar.push(vm.runInContext("arr.olvidando", sb)); } });
};
Object.assign(sb, {
  toast: () => {}, log: () => {},
  confirm: m => { preguntas.push(m); return respuesta; },
  escribirArchivoNavegador: async () => { escrituras++; },
  exHacerCopia: async () => { copias.push(recargas); return copiaSale; },
  location: { hash: "", reload: () => { recargas++; } },
});
const LO_DE_LA_APP = { reental_config: "{}", reental_copias: "[]", reental_dark: "1", reental_nav_plegada: "1", reental_datos_en_archivo: "no" };
// las de otra herramienta (los años declarados y tus notas, y el tema) y otra app.
const DE_LAS_HERRAMIENTAS = { otra_app: "x", reental_web_state_0xabc: '{"declarado":{"2025":true},"notas":"mía"}', reental_theme: "dark" };
const preparar = (modoIdb) => {
  for (const k of Object.keys(sb.localStorage)) delete sb.localStorage[k];
  Object.assign(sb.localStorage, LO_DE_LA_APP, DE_LAS_HERRAMIENTAS);
  sb.idbOperar = idb(modoIdb);
  preguntas = []; respuesta = "olvidar"; recargas = 0; borradas = []; escrituras = 0; copias = []; copiaSale = true;
  STATE.cache = sb.cacheVacia(); STATE.cache.transacciones.wallet_tokens.push({ hash: "0x1" }); STATE.cacheDirty = false;
  vm.runInContext("arr.olvidando = false;", sb);
};

(async () => {
  console.log("A) Cancelar");
  preparar("ok");
  for (const [nombre, r] of [["«Cancelar»", ""], ["Esc", null]]) {
    preparar("ok");
    respuesta = r;
    await sb.arrOlvidarTodo();
    assert(nombre + ": no borra nada ni recarga", preguntas.length === 1 && recargas === 0 && borradas.length === 0 && !copias.length &&
      Object.keys(LO_DE_LA_APP).every(k => sb.localStorage.getItem(k) === LO_DE_LA_APP[k]));
  }
  assert("con datos, el diálogo ofrece guardar una copia antes", preguntas[0] === "con copia", preguntas);
  const dlg = fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "index.html"), "utf8").match(/<dialog id="arrDlgOlvidar"[\s\S]*?<\/dialog>/);
  assert("el diálogo dice qué se borra y que sin copia no se recupera, con sus tres botones",
    !!dlg && /tus transacciones, tus decisiones y notas, el archivo de Reental, tus datos y tus API keys/.test(dlg[0]) &&
    /Sin una copia, no se puede recuperar\./.test(dlg[0]) && /value="copia"/.test(dlg[0]) && /value="olvidar"/.test(dlg[0]) && /value=""/.test(dlg[0]));
  preparar("ok");
  STATE.cache = sb.cacheVacia();
  respuesta = "";
  await sb.arrOlvidarTodo();
  assert("sin datos: sin la opción de la copia", preguntas[0] === "sin copia", preguntas);

  console.log("B) Olvidar todo");
  preparar("ok");
  await sb.arrOlvidarTodo();
  assert("borra todas las claves «reental_» (también el tema, el menú y la casilla)",
    Object.keys(LO_DE_LA_APP).every(k => sb.localStorage.getItem(k) === null), Object.keys(sb.localStorage));
  assert("A1: lo de las herramientas (años declarados, notas, tema) y de otra app se queda",
    Object.keys(DE_LAS_HERRAMIENTAS).every(k => sb.localStorage.getItem(k) === DE_LAS_HERRAMIENTAS[k]), Object.keys(sb.localStorage));
  // Una clave nueva de la app que no esté en la lista se quedaría tras «Olvidar todo».
  const usadas = new Set();
  for (const f of fs.readdirSync(BASE)) for (const m of fs.readFileSync(path.join(BASE, f), "utf8").matchAll(/"(reental_[a-z_]+)"/g)) usadas.add(m[1]);
  // La base de IndexedDB, el nombre del Excel, el número de la pestaña
  // (sessionStorage, sin datos) y el nombre de lo sin guardar que va a tus descargas.
  // Y el nombre de las copias (reental_cache_AAAA-MM-DD_HHMM.json).
  ["reental_spa", "reental_contabilidad", "reental_cache"].forEach(k => usadas.delete(k));
  const lista = vm.runInContext("ARR_CLAVES_NAVEGADOR", sb);
  assert("cada clave «reental_» de la app está en la lista que se borra", [...usadas].every(k => lista.includes(k)), [...usadas].filter(k => !lista.includes(k)));
  assert("vacía lo recordado en IndexedDB y recarga una vez", borradas.join() === "readwrite" && recargas === 1, { borradas, recargas });
  assert("al vaciar, ya no se puede guardar (arr.olvidando)", olvidandoAlBorrar.length > 0 && olvidandoAlBorrar.every(Boolean), olvidandoAlBorrar);
  assert("tu archivo no se escribe", escrituras === 0);

  console.log("B2) Otra pestaña de la app (auditoría COPIA, A5)");
  preparar("ok");
  const senales = [];
  const conSenal = new Almacen();
  conSenal.setItem = function (k, v) { senales.push(k); Almacen.prototype.setItem.call(this, k, v); };
  Object.assign(conSenal, LO_DE_LA_APP);
  sb.localStorage = conSenal;
  await sb.arrOlvidarTodo();
  assert("A5: avisa a las otras pestañas y no deja la señal guardada", senales.join() === "reental_olvidar" && sb.localStorage.getItem("reental_olvidar") === null, senales);
  sb.localStorage = new Almacen();
  sb.localStorage = new Almacen();
  recargas = 0;
  sb.arrAlCambiarAlmacen({ key: "reental_olvidar", newValue: "123" });
  assert("A5: la otra pestaña, al ver la señal, se recarga", recargas === 1);
  sb.arrAlCambiarAlmacen({ key: "reental_olvidar", newValue: null });
  sb.arrAlCambiarAlmacen({ key: "reental_config", newValue: null });
  assert("A5: lo demás no la recarga", recargas === 1);
  elemento("cfgDatosEnArchivo").checked = true;
  sb.localStorage.setItem("reental_datos_en_archivo", "no");
  sb.arrAlCambiarAlmacen({ key: "reental_datos_en_archivo", newValue: "no" });
  assert("A5: la casilla sale como la dejó la otra pestaña", elemento("cfgDatosEnArchivo").checked === false);

  console.log("C) «Guardar copia y olvidar» (ALMACEN-1)");
  sb.setTimeout = f => f();   // sin esperar el respiro de la descarga
  preparar("ok");
  respuesta = "copia";
  await sb.arrOlvidarTodo();
  assert("descarga la copia y después olvida", copias.join() === "0" && recargas === 1 && borradas.join() === "readwrite" &&
    sb.localStorage.getItem("reental_config") === null, { copias, recargas });
  preparar("ok");
  respuesta = "copia"; copiaSale = false;
  await sb.arrOlvidarTodo();
  assert("si la copia no se hace, no olvida nada", copias.length === 1 && recargas === 0 && borradas.length === 0 &&
    sb.localStorage.getItem("reental_config") === "{}");
  // No se borra nada hasta que confirmes que la copia está en tus descargas.
  preparar("ok");
  respuesta = "copia";
  const confirmBueno = sb.confirm;
  sb.confirm = m => { preguntas.push(m); return false; };
  await sb.arrOlvidarTodo();
  sb.confirm = confirmBueno;
  assert("tras la copia pregunta si está en tus descargas; «no» no borra nada", copias.length === 1 && recargas === 0 && borradas.length === 0 &&
    /Comprueba que está en tus descargas\. ¿Olvidar todo ya\?/.test(preguntas[1] || ""), preguntas);
  // Con una descarga en marcha, la copia no se puede hacer: se dice y no se borra nada.
  preparar("ok");
  respuesta = "copia";
  const avisosA11 = []; const toastBueno = sb.toast;
  sb.toast = (m, t) => avisosA11.push([t, m]);
  vm.runInContext("arr.preparando = true;", sb);
  await sb.arrOlvidarTodo();
  vm.runInContext("arr.preparando = false;", sb);
  sb.toast = toastBueno;
  assert("A11: con una descarga en marcha lo dice y no borra nada", copias.length === 0 && recargas === 0 &&
    avisosA11.some(([t, m]) => t === "warn" && /Espera a que termine/.test(m)), avisosA11);
  // Con solo tus datos escritos (sin transacciones), también ofrece la copia.
  preparar("ok");
  STATE.cache = sb.cacheVacia(); elemento("cfgWallet").value = "0x" + "44".repeat(20);
  respuesta = "";
  await sb.arrOlvidarTodo();
  elemento("cfgWallet").value = "";
  assert("A14: con solo tus datos escritos, ofrece guardar la copia", preguntas[0] === "con copia", preguntas);
  sb.setTimeout = setTimeout;

  console.log("D) IndexedDB que falla");
  {
    const modo = "falla";
    preparar(modo);
    await sb.arrOlvidarTodo();
    assert("IndexedDB " + modo + ": borra localStorage y recarga igual", recargas === 1 && sb.localStorage.getItem("reental_config") === null);
  }
  preparar("ok");
  sb.localStorage = new Proxy({}, { ownKeys() { throw new Error("bloqueado"); } });
  await sb.arrOlvidarTodo();
  assert("localStorage bloqueado: vacía IndexedDB y recarga igual", borradas.join() === "readwrite" && recargas === 1);

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
