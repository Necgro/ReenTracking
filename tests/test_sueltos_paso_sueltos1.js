/* Test de retoques cortos de la interfaz.
 *
 * Bajo prueba:
 * - js/16: el gráfico del dinero invertido lleva una zona por mes para el
 *   bocadillo (ya sin <title>) y el bocadillo dice el mes y lo invertido.
 * - js/18: el resumen de triaje cuenta lo DeFi (sin el spam) y pinta el
 *   botón «DeFi», pulsado o no; sin nada DeFi, no sale. Con
 *   «DeFi» pulsado, el número del spam es el de todo el spam.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_sueltos_paso_sueltos1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const S = { console, state: {}, log: () => {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

console.log("== 1. Bocadillo del dinero invertido (js/16) ==");
const serie = [{ etiqueta: "2024-03", valor: 548 }, { etiqueta: "2024-04", valor: 548 }, { etiqueta: "2024-05", valor: 588.5 }];
const svg = S.dashSvgLinea(serie);
const zonas = [...svg.matchAll(/<g class="dash-col" data-i="(\d+)"><rect class="dash-col-zona" x="([\d.]+)" y="\d+" width="([\d.]+)"/g)]
  .map(m => [+m[1], +m[2], +m[3]]);
assert("una zona por mes, en orden", JSON.stringify(zonas.map(z => z[0])) === "[0,1,2]", zonas);
assert("las zonas no se pisan ni se salen del gráfico (64 … 744)",
  zonas.every(([, x, w], i) => x >= 64 && x + w <= 744.05 && (i === 0 || Math.abs(zonas[i - 1][1] + zonas[i - 1][2] - x) < 0.2)), zonas);
assert("ya sin <title> (el bocadillo lo sustituye)", !svg.includes("<title>"));
assert("cada zona con su punto escondido", (svg.match(/dash-punto-sel/g) || []).length === 3);
const uno = S.dashSvgLinea([{ etiqueta: "2024-03", valor: 10 }]);
assert("con un solo mes, una zona de todo el ancho", /data-i="0"><rect class="dash-col-zona" x="64.0" y="16" width="680.0"/.test(uno), uno.slice(-300));
assert("bocadillo: el mes y lo invertido",
  S.dashHtmlBocadilloInvertido(serie[2]) === '<b>may 2024</b><div class="dash-tip-f"><span>Invertido</span><b>588,50 USD</b></div>',
  S.dashHtmlBocadilloInvertido(serie[2]));
assert("para un lector de pantalla, lo mismo en una frase", S.dashTextoBocadilloInvertido(serie[0]) === "mar 2024: invertido 548,00 USD.");
const tarjeta = S.dashTarjetaInvertido({ compras: 2, ventas: 0, sinImporte: 0, sinCambio: 0, sinFecha: 0 }, serie);
assert("la tarjeta: gráfico enfocable con su bocadillo y su zona para el lector",
  /class="dash-chart dash-tipcaja dash-invertido" role="img" tabindex="0"/.test(tarjeta) &&
  tarjeta.includes('<div class="dash-tip" hidden></div></div><div class="solo-lector" aria-live="polite"></div>'), tarjeta);

{
  const html = fs.readFileSync(path.join(SPA, "index.html"), "utf8");
  assert("REVISION-3: los meses de la tarjeta como en el bocadillo (T5) y los textos de la barra lateral (T6, T9)",
    tarjeta.includes(">mar 2024 – may 2024 · 2 compras y 0 ventas") &&
    // El pie dice «Datos solo en este navegador» (verifymenu1.js).
    html.includes(">Datos solo en este navegador<") &&
    html.includes('title="Plegar el menú (solo iconos)"') && !html.includes("para dar más sitio"), tarjeta.slice(0, 300));
}

console.log("== 2. Botón «DeFi» del triaje (js/18) ==");
const W = "0x" + "1".repeat(40), POOL = "0x" + "a".repeat(40), OTRO = "0x" + "c".repeat(40);
const reg = (clave, categoria, subcategoria, o) => Object.assign({ clave, hash: clave, categoria, subcategoria, fecha: "2026-03-01 10:00:00" }, o);
const regs = [
  reg("rw", "REWARD", "RCM_REWARD", { origen: OTRO, destino: W }),
  reg("mp", "MOVIMIENTO", "NEUTRO", { origen: W, destino: POOL }),
  reg("gp", "COMISION", "NEUTRO", { hash: "mp", origen: W, destino: POOL }),
  reg("gn", "COMISION", "NEUTRO", { origen: W, destino: OTRO }),
  reg("sp", "SPAM", "SPAM", { origen: POOL, destino: W }),          // spam escondido: no cuenta
  null,
];
const defi = S.txDatosDefi({ contratos_aprendidos: { DEFI_POOL: { [POOL]: "Pool" } }, transacciones: {} }, regs.filter(Boolean));
const res = S.txResumenTriaje(regs, undefined, defi);
assert("cuenta 3 DeFi: recompensa, traspaso al pool y su gas (sin el spam)", res.defi === 3 && res.total === 5, res);
assert("sin datos DeFi, 0 (llamadas de antes)", S.txResumenTriaje(regs).defi === 0);
const sinPulsar = S.txHtmlTriaje(res, "", false);
assert("el botón, algo separado, con su número y sin pulsar",
  /<span class="tx-triaje-sep" aria-hidden="true">·<\/span><button type="button" class="tx-kpi tx-g-defi" data-defi aria-pressed="false" title="[^"]+"><b>3<\/b> DeFi<\/button>$/.test(sinPulsar),
  sinPulsar.slice(-260));
assert("pulsado: «activo» y aria-pressed", /class="tx-kpi tx-g-defi activo" data-defi aria-pressed="true"/.test(S.txHtmlTriaje(res, "neutro", true)));
assert("sin nada DeFi no sale", !S.txHtmlTriaje(Object.assign({}, res, { defi: 0 }), "", false).includes("data-defi"));
assert("sin nada DeFi pero pulsado, sale (para poder quitarlo)", S.txHtmlTriaje(Object.assign({}, res, { defi: 0 }), "", true).includes("<b>0</b> DeFi"));
assert("el filtro DeFi y el de grupo se suman", JSON.stringify(regs.filter(r => r && S.txPasaFiltros(r, { defi, grupo: "neutro", ocultarSpam: true }))
  .map(r => r.clave)) === '["mp","gp"]');

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
