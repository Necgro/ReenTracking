/* Test de la cache con tus datos dentro: admite y conserva los dos bloques de «un solo archivo».
 *
 * Bajo prueba (Reental-SPA/js/05-cache.js):
 * - ponerConfiguracionCache / leerConfiguracionCache: solo wallet, vault,
 *   nombre y NIF; nunca las API keys; direcciones en minúsculas.
 * - ponerArchivoRendimientosCache / leerArchivoRendimientosCache: nombre,
 *   texto tal cual y fecha de carga.
 * - Mal escritos (null, lista, texto, un campo que no es texto): leer da
 *   null, asegurarEstructuraCache avisa y no los borra; con null, sin aviso.
 * - Fuera de la plantilla: una cache nueva no los lleva; una cache con
 *   ellos sigue valiendo (errorCache) y no es «rara» (arrCacheRara mira solo
 *   la plantilla).
 * - Ida y vuelta por JSON.stringify sin perder nada.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_cache_bloques_paso_pm1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA");
const registro = [];
const S = { console };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "14-clasificador.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, "js", f), "utf8"), S, { filename: f });
}
S.log = (msg, tipo) => registro.push([tipo, msg]);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const json = x => JSON.stringify(x);
const ida = c => JSON.parse(JSON.stringify(c));
const W = "0x" + "AB".repeat(20), V = "0x" + "cd".repeat(20);
const CLAVE = "CLAVE_SINTETICA_123", CLAVE_CG = "CG_SINTETICA_456";
const CSV = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet\n\"Prueba#1\",2024-07-10,2,0,2,0,\"[]\",\"[]\"," + W + "\n";
const AHORA = new Date("2026-10-07T10:00:00Z");

console.log("== 1. Cache nueva ==");
const nueva = S.cacheVacia();
assert("no lleva los bloques nuevos", !("configuracion" in nueva) && !("archivo_rendimientos" in nueva));
assert("sin bloques, leer da null", S.leerConfiguracionCache(nueva) === null && S.leerArchivoRendimientosCache(nueva) === null);
assert("sin cache, leer da null", S.leerConfiguracionCache(null) === null && S.leerArchivoRendimientosCache(undefined) === null);

console.log("== 2. Tus datos ==");
const c = S.asegurarEstructuraCache(ida(nueva));
const cfg = { wallet: " " + W + " ", vault: V, etherscan_api_key: CLAVE, coingecko_api_key: CLAVE_CG,
  inversor: { nombre: " Ana Prueba ", nif: "00000000T", otro: "x" }, compra_bancaria_coste_eur_por_token: 100 };
S.ponerConfiguracionCache(c, cfg);
assert("solo wallet, vault, nombre y NIF, recortados y en minúsculas",
  json(c.configuracion) === json({ wallet: W.toLowerCase(), vault: V, inversor: { nombre: "Ana Prueba", nif: "00000000T" } }), c.configuracion);
assert("nunca las API keys en el archivo", !JSON.stringify(c).includes(CLAVE) && !JSON.stringify(c).includes(CLAVE_CG));
assert("leer devuelve lo mismo", json(S.leerConfiguracionCache(c)) === json(c.configuracion));
S.ponerConfiguracionCache(c, { wallet: W });
assert("sin vault ni inversor: vacíos", json(c.configuracion) === json({ wallet: W.toLowerCase(), vault: "", inversor: { nombre: "", nif: "" } }));
S.ponerConfiguracionCache(c, { wallet: 7, vault: null, inversor: ["Ana"] });
assert("campos raros en la config: vacíos, no rompe", json(c.configuracion) === json({ wallet: "", vault: "", inversor: { nombre: "", nif: "" } }));
S.ponerConfiguracionCache(c, null);
assert("config null: vacíos", S.leerConfiguracionCache(c).wallet === "");
c.configuracion = { wallet: W };
assert("bloque escrito a mano sin vault ni inversor: vale, con vacíos",
  json(S.leerConfiguracionCache(c)) === json({ wallet: W, vault: "", inversor: { nombre: "", nif: "" } }));
// Con la casilla marcada (conClaves), también las API keys, recortadas.
S.ponerConfiguracionCache(c, cfg, true);
assert("con conClaves: también las dos API keys", c.configuracion.etherscan_api_key === CLAVE && c.configuracion.coingecko_api_key === CLAVE_CG);
assert("y leer las devuelve", json(S.leerConfiguracionCache(c)) === json(c.configuracion));
c.configuracion.etherscan_api_key = 7;
assert("una API key mal escrita (un número): tus datos valen y la clave no se lee",
  S.leerConfiguracionCache(c) && S.leerConfiguracionCache(c).wallet === W.toLowerCase() && !("etherscan_api_key" in S.leerConfiguracionCache(c)));

console.log("== 3. Archivo de rendimientos ==");
S.ponerArchivoRendimientosCache(c, " reental_rendimientos.csv ", CSV, AHORA);
assert("nombre, texto tal cual y fecha", json(c.archivo_rendimientos) ===
  json({ nombre: "reental_rendimientos.csv", texto: CSV, cargado: "2026-10-07T10:00:00.000Z" }));
assert("leer devuelve lo mismo", json(S.leerArchivoRendimientosCache(c)) === json(c.archivo_rendimientos));
S.ponerArchivoRendimientosCache(c, null, CSV, AHORA);
assert("sin nombre: vacío", S.leerArchivoRendimientosCache(c).nombre === "");
const otro = CSV.replace("Prueba#1", "Prueba#2");
S.ponerArchivoRendimientosCache(c, "nuevo.csv", otro, AHORA);
assert("el nuevo sustituye al de dentro", S.leerArchivoRendimientosCache(c).texto === otro && S.leerArchivoRendimientosCache(c).nombre === "nuevo.csv");

console.log("== 4. Ida y vuelta ==");
S.ponerConfiguracionCache(c, cfg);
S.ponerArchivoRendimientosCache(c, "reental_rendimientos.csv", CSV, AHORA);
const vuelta = S.asegurarEstructuraCache(ida(c));
assert("por JSON y asegurarEstructuraCache, idénticos",
  json(vuelta.configuracion) === json(c.configuracion) && json(vuelta.archivo_rendimientos) === json(c.archivo_rendimientos));
assert("la cache con los bloques sigue valiendo", S.errorCache(ida(c)) === "");
assert("y no es «rara» para recuperar una copia (solo mira la plantilla)",
  !Object.keys(S.cacheVacia()).includes("configuracion") && !Object.keys(S.cacheVacia()).includes("archivo_rendimientos"));

console.log("== 5. Mal escritos ==");
const malos = {
  configuracion: [[], "texto", 3, { wallet: 7 }, { wallet: W, inversor: "Ana" }, { wallet: W, inversor: { nif: 5 } }],
  archivo_rendimientos: [[], "texto", {}, { texto: "" }, { texto: "   " }, { texto: 5 }, { texto: CSV, nombre: 3 }, { texto: CSV, cargado: {} }],
};
for (const [bloque, lista] of Object.entries(malos)) {
  const leer = bloque === "configuracion" ? S.leerConfiguracionCache : S.leerArchivoRendimientosCache;
  for (const malo of lista) {
    registro.length = 0;
    const x = ida(nueva); x[bloque] = malo;
    const r = S.asegurarEstructuraCache(x);
    assert(bloque + " = " + json(malo) + ": leer da null, se avisa y no se borra",
      leer(r) === null && json(r[bloque]) === json(malo) && registro.some(([t, m]) => t === "warn" && m.includes(bloque)), registro);
  }
  registro.length = 0;
  const conNull = ida(nueva); conNull[bloque] = null;
  const r = S.asegurarEstructuraCache(conNull);
  assert(bloque + " = null: como si no estuviera, sin aviso", leer(r) === null && registro.length === 0, registro);
}
registro.length = 0;
const dosMal = ida(nueva); dosMal.configuracion = []; dosMal.archivo_rendimientos = "x";
S.asegurarEstructuraCache(dosMal);
assert("los dos mal a la vez: dos avisos", registro.filter(([t]) => t === "warn").length === 2, registro);
const malYBueno = ida(nueva); malYBueno.configuracion = "roto";
S.ponerConfiguracionCache(malYBueno, cfg);
assert("uno bueno sustituye al mal escrito", S.leerConfiguracionCache(malYBueno).wallet === W.toLowerCase());
registro.length = 0;
S.asegurarEstructuraCache(ida(c));
assert("con los dos bien, sin avisos", registro.length === 0, registro);

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
