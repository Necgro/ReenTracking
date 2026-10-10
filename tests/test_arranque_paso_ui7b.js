/* Test unitario de recuperar una copia de seguridad en 🚀 Puesta en
 * marcha (js/19).
 *
 * Bajo prueba:
 * - arrLeerCopia: la copia del formato viejo se lee entera; una
 *   cache, un config.json u otro archivo se rechazan diciendo qué son; una
 *   versión más nueva, una copia vacía o con una parte mal, también (sin
 *   aplicar nada); lo que trae, en el formato de exTextoLleva.
 * - arrFechaCopia: la fecha de la copia con la hora de este ordenador.
 * - Casos límite: cache que rompería al
 *   pintarla, todas las partes mal con su motivo, fechas sin hora.
 *
 * DATOS 100% SINTÉTICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_arranque_paso_ui7b.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sb = { console, state: {}, structuredClone };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "04-config.js", "05-cache.js", "10-csv-descubrimiento.js",
  "14-clasificador.js", "19-arranque.js", "24-exportar.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
}
const { arrLeerCopia, arrFechaCopia, exTextoLleva, cacheVacia } = sb;
/* La copia del formato viejo (versión 1), como se armaba: se sigue
   abriendo con «📂 Abrir copia». */
function exArmarCopiaVieja({ config, cache, csv, incluirClaves, ahora }) {
  let cfg = null;
  if (config && typeof config === "object") {
    cfg = { ...config };
    if (!incluirClaves) for (const k of ["etherscan_api_key", "coingecko_api_key"]) if (k in cfg) cfg[k] = "";
  }
  return { tipo: "copia_de_seguridad", version: 1, creada: ahora.toISOString(), contenido: { config: cfg,
    cache: cache ? structuredClone(cache) : null,
    rendimientos: csv && typeof csv.texto === "string" ? { nombre: csv.nombre || "", texto: csv.texto } : null } };
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
// Como al abrirla del disco: escrita y vuelta a leer.
const json = o => JSON.parse(JSON.stringify(o));

const W = "0x" + "11".repeat(20);
const config = { wallet: W, vault: "", etherscan_api_key: "CLAVE_ETH", coingecko_api_key: "",
  inversor: { nombre: "Prueba", nif: "00000000T" }, compra_bancaria_coste_eur_por_token: 100 };
const cache = cacheVacia();
for (let i = 1; i <= 3; i++) cache.transacciones.wallet_tokens.push({ hash: "0x" + String(i).padStart(64, "0"), value: "1" });
const textoCsv = ["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet",
  "\"Prueba Uno#1\",2025-06-10,3,0,3,0,\"['0x" + "1".padStart(64, "0") + "']\",\"[]\"," + W,
  "\"Prueba Uno#2\",2025-12-10,3,0,3,0,\"['0x" + "2".padStart(64, "0") + "']\",\"[]\"," + W].join("\n");
const csv = { nombre: "rendimientos_prueba.csv", texto: textoCsv };
const ahora = new Date(2026, 0, 15, 22, 21);   // 15/01/2026 22:21, hora local

/* ============ A) la copia de 📤 Exportar se lee entera ============ */
console.log("A) Ida y vuelta con exArmarCopia");
const copia = json(exArmarCopiaVieja({ config, cache, csv, incluirClaves: false, ahora }));
const r = arrLeerCopia(copia);
assert("sin error", !r.error, r.error);
assert("trae la cache tal cual", JSON.stringify(r.cache) === JSON.stringify(cache));
assert("trae la config (las API keys vacías, como sale de la copia)", r.config.wallet === W && r.config.etherscan_api_key === "");
assert("trae el archivo de rendimientos con su nombre y su texto", r.rendimientos.nombre === csv.nombre && r.rendimientos.texto === textoCsv);
assert("qué trae, en una línea", exTextoLleva(r.lleva) === "3 transacciones · 2 repartos · tus datos", exTextoLleva(r.lleva));
const conClaves = arrLeerCopia(json(exArmarCopiaVieja({ config, cache: null, csv: null, incluirClaves: true, ahora })));
assert("con las API keys lo dice; sin cache ni archivo, solo la config",
  !conClaves.error && exTextoLleva(conClaves.lleva) === "tus datos y API keys" && conClaves.cache === null && conClaves.rendimientos === null,
  conClaves);
const soloCache = arrLeerCopia(json(exArmarCopiaVieja({ config: null, cache: cacheVacia(), csv: null, incluirClaves: false, ahora })));
assert("solo una cache vacía: vale y cuenta 0 movimientos", !soloCache.error && exTextoLleva(soloCache.lleva) === "0 transacciones", soloCache);
assert("la fecha de la copia, con la hora local", arrFechaCopia(copia.creada) === "15/01/2026 22:21", arrFechaCopia(copia.creada));
assert("una fecha que no lo es: vacía", arrFechaCopia("ayer") === "" && arrFechaCopia(null) === "" && arrFechaCopia(12) === "");
assert("A16: sin hora, con un día que no existe o un número suelto: no se inventa",
  ["2026-01-15", "2026-02-30T10:00:00Z", "1", "2026-01-15T22:21:00"].every(f => arrFechaCopia(f) === ""),
  ["2026-01-15", "2026-02-30T10:00:00Z", "1", "2026-01-15T22:21:00"].map(arrFechaCopia));
assert("A16: sin milisegundos también vale", arrFechaCopia(copia.creada.replace(/\.\d+Z$/, "Z")) === "15/01/2026 22:21");

/* ============ B) otros archivos ============ */
console.log("B) Lo que no es una copia");
assert("tu cache: lo dice y dónde se abre", /es tu archivo.*Abrir copia/.test(arrLeerCopia(json(cache)).error || ""));
assert("tu config.json: lo dice y dónde se abre", /es tu config\.json.*Abrir copia/.test(arrLeerCopia(json(config)).error || ""));
for (const [nombre, obj] of [["una lista", []], ["un número", 7], ["null", null], ["un texto", "x"], ["un objeto cualquiera", { a: 1 }],
  ["otro tipo", { tipo: "otra_cosa", version: 1, contenido: {} }]]) {
  assert(nombre + ": «no es una copia de seguridad»", arrLeerCopia(obj).error === "Ese archivo no es una copia de seguridad.", arrLeerCopia(obj));
}

/* ============ C) copias que no se pueden usar ============ */
console.log("C) Copias que no se aplican");
const con = cambio => { const c = json(copia); cambio(c); return arrLeerCopia(c).error || ""; };
assert("versión más nueva", /versión más nueva/.test(con(c => { c.version = 2; })));
assert("sin versión o con otra cosa: mal escrita", /mal escrita/.test(con(c => { delete c.version; })) && /mal escrita/.test(con(c => { c.version = "1"; })));
assert("sin contenido: mal escrita", /mal escrita/.test(con(c => { delete c.contenido; })) && /mal escrita/.test(con(c => { c.contenido = []; })));
assert("vacía (las tres partes null o ausentes)", /vacía/.test(con(c => { c.contenido = { config: null, cache: null, rendimientos: null }; })) &&
  /vacía/.test(con(c => { c.contenido = {}; })));
assert("config mal (la wallet no es un texto)", /su config no vale/.test(con(c => { c.contenido.config.wallet = 5; })));
assert("config que no es un objeto", /su config no vale/.test(con(c => { c.contenido.config = "x"; })));
assert("cache mal (sin transacciones)", /su archivo de la app no vale/.test(con(c => { delete c.contenido.cache.transacciones; })));
assert("archivo de rendimientos sin texto", /rendimientos no vale/.test(con(c => { c.contenido.rendimientos = { nombre: "x" }; })));
assert("archivo de rendimientos sin columnas", /rendimientos no vale/.test(con(c => { c.contenido.rendimientos.texto = "a,b\n1,2"; })));
assert("archivo de rendimientos solo con la cabecera", /rendimientos no vale/.test(con(c => { c.contenido.rendimientos.texto = textoCsv.split("\n")[0]; })));
assert("archivo de rendimientos que no es un objeto", /rendimientos no vale/.test(con(c => { c.contenido.rendimientos = "texto"; })));
assert("A15: dos partes mal a la vez: las nombra las dos, sin lanzar",
  con(c => { c.contenido.config = 1; c.contenido.cache = 2; }) === "Esa copia está mal escrita: su config no vale; su archivo de la app no vale.",
  con(c => { c.contenido.config = 1; c.contenido.cache = 2; }));
assert("A15: el archivo de rendimientos dice por qué (ANSI)",
  /su archivo de rendimientos no vale \(El archivo de rendimientos no está en UTF-8.*\)\.$/.test(con(c => { c.contenido.rendimientos.texto = textoCsv.replace("Uno", "Un�"); })),
  con(c => { c.contenido.rendimientos.texto = textoCsv.replace("Uno", "Un�"); }));
// Lo que errorCache deja pasar pero rompe al pintarla.
for (const [nombre, cambio] of [["tipos_bce: null", c => { c.contenido.cache.tipos_bce = null; }],
  ["precios_rnt: una lista", c => { c.contenido.cache.precios_rnt = []; }],
  ["catalogo_propiedades: un texto", c => { c.contenido.cache.catalogo_propiedades = "x"; }],
  ["una transacción null", c => { c.contenido.cache.transacciones.wallet_tokens.push(null); }]]) {
  assert("A6: cache con " + nombre + ": su archivo de la app no vale", /su archivo de la app no vale/.test(con(cambio)), con(cambio));
}
assert("A6: lo que la app arregla sola sí vale (pagos_diferidos null, un bloque que falta, una serie que no es lista)",
  con(c => { c.contenido.cache.pagos_diferidos = null; delete c.contenido.cache.precios_pol; c.contenido.cache.transacciones.vault_tokens = 3; }) === "");
assert("la copia comprobada no cambia", JSON.stringify(copia) === JSON.stringify(json(exArmarCopiaVieja({ config, cache, csv, incluirClaves: false, ahora }))));

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
