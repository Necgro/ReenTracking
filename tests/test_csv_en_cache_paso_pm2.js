/* Test: el archivo de rendimientos de Reental se guarda dentro de la cache.
 *
 * Bajo prueba (Reental-SPA/js/12-carga-archivos.js):
 * - cargarCsv: con la cache abierta, el archivo entra en ella, se marca y
 *   se guarda; el mismo otra vez no la toca; sin cache, se queda en memoria.
 *   Uno más antiguo (termina antes o trae menos repartos) se pregunta: «no»
 *   no cambia nada, «sí» lo usa. Uno con solo la cabecera se rechaza sin
 *   tocar la cache.
 * - cargarCsvDeLaCache: abrir una cache con archivo lo aplica; sin él, el
 *   cargado entra; con los dos, gana el de dentro salvo que el de fuera sea
 *   más nuevo; uno de dentro que no se puede leer se ignora con aviso; dos
 *   cosas mal a la vez (CSV vacío + cache sin bloque).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_csv_en_cache_paso_pm2.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const elementos = {};
const elemento = id => (elementos[id] = elementos[id] || { id, value: "", innerHTML: "", textContent: "", disabled: false,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
const registro = [], avisos = [];
let respuesta = true, preguntas = [], escrituras = 0, trasCargar = [];
const S = { console, document: { getElementById: elemento } };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js", "12-carga-archivos.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
S.log = (msg, tipo) => registro.push([tipo, msg]);
S.toast = (msg, tipo) => avisos.push([tipo, msg]);
S.confirm = msg => { preguntas.push(msg); return respuesta; };
S.escribirArchivoNavegador = async () => { escrituras++; };   // lo único que escribe (js/05)
S.actualizarChipEstado = () => {};
S.arrTrasCargarCsv = async (nombre, texto) => { trasCargar.push(nombre); };
const STATE = vm.runInContext("state", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const W = "0x" + "ab".repeat(20);
const CAB = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
const fila = (n, fecha) => "\"Prueba#" + n + "\"," + fecha + ",2,0,2,0,\"[]\",\"[]\"," + W;
const csv = fechas => [CAB, ...fechas.map((f, i) => fila(i + 1, f))].join("\n") + "\n";
const C2 = csv(["2026-01-10", "2026-02-10"]), C3 = csv(["2026-01-10", "2026-02-10", "2026-03-10"]);
const C3B = csv(["2026-01-10", "2026-02-10", "2026-02-20"]);           // termina antes que C3
const C4MISMO = csv(["2026-01-10", "2026-02-10", "2026-03-10", "2026-03-10"]);
const archivo = (nombre, texto) => ({ name: nombre, text: async () => texto });
const limpiar = () => {
  STATE.cache = null; STATE.cacheHandle = null; STATE.cacheDirty = false;
  STATE.filasCsv = []; STATE.indicePorHash = {}; STATE.csvCargado = false; STATE.csvArchivo = undefined;
  preguntas = []; escrituras = 0; trasCargar = []; respuesta = true; registro.length = 0; avisos.length = 0;
};
const dentro = () => S.leerArchivoRendimientosCache(STATE.cache);

(async () => {
  console.log("== 1. Cargar con la cache abierta ==");
  limpiar();
  STATE.cache = S.cacheVacia(); STATE.cacheHandle = { h: 1 };
  await S.cargarCsv(archivo("reental_rendimientos.csv", C2));
  assert("entra en la cache con su nombre, se guarda y avisa a js/19",
    dentro() && dentro().texto === C2 && dentro().nombre === "reental_rendimientos.csv" && escrituras === 1 &&
    !STATE.cacheDirty && JSON.stringify(trasCargar) === JSON.stringify(["reental_rendimientos.csv"]));
  await S.cargarCsv(archivo("reental_rendimientos.csv", C2));
  assert("el mismo otra vez: no pregunta ni vuelve a guardar", preguntas.length === 0 && escrituras === 1);
  await S.cargarCsv(archivo("nuevo.csv", C3));
  assert("uno más nuevo: lo sustituye sin preguntar", preguntas.length === 0 && dentro().texto === C3 && dentro().nombre === "nuevo.csv" && escrituras === 2);

  console.log("== 2. Uno más antiguo ==");
  respuesta = false;
  await S.cargarCsv(archivo("viejo.csv", C2));
  assert("trae menos repartos: pregunta con la fecha del que tienes; «no» no cambia nada",
    preguntas[0] === "Este archivo es más antiguo que el que ya tienes (hasta 10/03/2026). ¿Usarlo igualmente?" &&
    dentro().texto === C3 && STATE.filasCsv.length === 3 && escrituras === 2 && trasCargar.length === 3, preguntas);
  preguntas = [];
  await S.cargarCsv(archivo("viejo.csv", C3B));
  assert("termina antes (mismos repartos): también pregunta", preguntas.length === 1 && dentro().texto === C3);
  respuesta = true;
  await S.cargarCsv(archivo("viejo.csv", C3B));
  assert("«sí»: lo usa y lo guarda", dentro().texto === C3B && STATE.filasCsv.length === 3 && escrituras === 3);

  console.log("== 3. Archivos que no valen ==");
  const antes = escrituras;
  await S.cargarCsv(archivo("vacio.csv", CAB + "\n"));
  assert("solo la cabecera: se rechaza, sin preguntar ni tocar la cache",
    dentro().texto === C3B && escrituras === antes && avisos.some(([t, m]) => t === "error" && /ningún reparto/.test(m)));
  await S.cargarCsv(archivo("roto.csv", "esto no es un csv"));
  assert("uno roto: tampoco", dentro().texto === C3B && escrituras === antes);
  await S.cargarCsv({ name: "x.csv", text: async () => { throw new Error("no se puede leer"); } });
  assert("si no se puede leer el archivo: avisa y no cambia nada", dentro().texto === C3B && avisos.some(([, m]) => /No se pudo leer/.test(m)));

  console.log("== 4. Sin cache abierta ==");
  limpiar();
  await S.cargarCsv(archivo("reental_rendimientos.csv", C2));
  assert("se queda en memoria con su nombre", STATE.csvCargado && STATE.csvArchivo.texto === C2 && STATE.csvArchivo.nombre === "reental_rendimientos.csv" && escrituras === 0);
  const sinBloque = S.cacheVacia();
  assert("al abrir una cache sin archivo, el cargado entra en ella", S.cargarCsvDeLaCache(sinBloque) === "fuera" &&
    S.leerArchivoRendimientosCache(sinBloque).texto === C2);

  console.log("== 5. Abrir una cache con archivo ==");
  limpiar();
  const conBloque = S.cacheVacia();
  S.ponerArchivoRendimientosCache(conBloque, "de-dentro.csv", C3, new Date());
  assert("sin nada cargado: se aplica el de dentro", S.cargarCsvDeLaCache(conBloque) === "dentro" &&
    STATE.filasCsv.length === 3 && STATE.csvArchivo.nombre === "de-dentro.csv" &&
    avisos.length === 0);
  assert("el mismo otra vez: «dentro», sin tocar nada", S.cargarCsvDeLaCache(conBloque) === "dentro");
  limpiar();
  await S.cargarCsv(archivo("fuera.csv", C2));
  assert("con uno más viejo cargado: manda el de dentro", S.cargarCsvDeLaCache(conBloque) === "dentro" &&
    STATE.filasCsv.length === 3 && S.leerArchivoRendimientosCache(conBloque).texto === C3);
  limpiar();
  await S.cargarCsv(archivo("fuera.csv", C4MISMO));
  const conBloque2 = S.cacheVacia();
  S.ponerArchivoRendimientosCache(conBloque2, "de-dentro.csv", C3, new Date());
  assert("con uno más nuevo cargado (mismo día, más repartos): gana el de fuera y entra en la cache",
    S.cargarCsvDeLaCache(conBloque2) === "fuera_mas_nuevo" && S.leerArchivoRendimientosCache(conBloque2).texto === C4MISMO &&
    STATE.filasCsv.length === 4);

  console.log("== 6. Cosas mal ==");
  limpiar();
  const rota = S.cacheVacia();
  rota.archivo_rendimientos = { nombre: "x.csv", texto: "no es un csv" };
  assert("uno de dentro que no se puede leer: se ignora con aviso", S.cargarCsvDeLaCache(rota) === "ninguno" &&
    !STATE.csvCargado && registro.some(([t, m]) => t === "warn" && /no se puede leer/.test(m)), registro);
  await S.cargarCsv(archivo("fuera.csv", C2));
  assert("roto dentro y uno cargado: el cargado lo sustituye", S.cargarCsvDeLaCache(rota) === "fuera" &&
    S.leerArchivoRendimientosCache(rota).texto === C2);
  limpiar();
  await S.cargarCsv(archivo("vacio.csv", CAB + "\n"));
  const nueva = S.cacheVacia();
  assert("CSV vacío + cache sin bloque: nada que hacer y la cache sin tocar",
    S.cargarCsvDeLaCache(nueva) === "ninguno" && !("archivo_rendimientos" in nueva));
  limpiar();
  const malEscrito = S.cacheVacia(); malEscrito.archivo_rendimientos = [];
  assert("bloque mal escrito y nada cargado: «ninguno» y no se borra",
    S.cargarCsvDeLaCache(malEscrito) === "ninguno" && Array.isArray(malEscrito.archivo_rendimientos));

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})();
