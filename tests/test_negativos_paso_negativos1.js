/* Negativos: en «Ajustes en JSON», un importe o una cantidad negativos no
 * se aceptan al aplicar (📊 Dashboard y 💰 Rendimientos los sumarían; el
 * motor los manda a revisar). El resultado
 * de un pool (gp_eur) sí puede ser negativo. Tampoco con el nombre antiguo
 * del campo (bruto_usdt) ni un número imposible (1e999). La prueba en el
 * navegador, en tests/navegador/verifyarreglos1b.js.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_negativos_paso_negativos1.js
 */
"use strict";
const { sandbox, HORA_APP } = require("./paridad_motor_fiscal_paso_51f.js");

let fallos = 0, oks = 0;
function assert(nombre, cond, extra) {
  if (cond) { oks++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const sb = sandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "14-clasificador.js"], HORA_APP);
const error = obj => sb.errorAjustesUsuario(obj);

for (const campo of ["cantidad", "importe_usdt", "coste_eur", "integro_usdt", "retencion_usdt"]) {
  const e = error({ "0xa::0": { categoria: "RENDIMIENTO", [campo]: -5 } });
  assert(campo + " negativo: no se acepta y dice cuál", e === "«" + campo + "» de «0xa::0» no puede ser negativo", e);
}
assert("el segundo ajuste negativo también se ve", /de «0xb::0»/.test(error({ "0xa::0": { importe_usdt: 5 }, "0xb::0": { coste_eur: -1 } })));
for (const [nombre, obj] of [
  ["importes positivos y 0", { "0xa::0": { importe_usdt: 12.5, coste_eur: 0, cantidad: 3 } }],
  ["el resultado de un pool en negativo (puede perder)", { "0xa::0": { categoria: "VENTA", subcategoria: "GPP_POOL", gp_eur: -40 } }],
  ["un importe en texto (lo para el motor, como antes)", { "0xa::0": { importe_usdt: "-5" } }],
  ["sin ajustes", {}],
]) assert(nombre + ": se acepta", error(obj) === "", error(obj));
assert("el nombre antiguo (bruto_usdt) también: dice el nombre escrito",
  error({ "0xa::0": { bruto_usdt: -50 } }) === "«bruto_usdt» de «0xa::0» no puede ser negativo", error({ "0xa::0": { bruto_usdt: -50 } }));
const infinito = JSON.parse('{"0xa::0": {"integro_usdt": 1e999}}');
assert("un número imposible (1e999, infinito) no se acepta", error(infinito) === "«integro_usdt» de «0xa::0» no es un número válido", error(infinito));
assert("un importe en -1e999: «no es un número válido» (no «negativo»)",
  error(JSON.parse('{"0xa::0": {"importe_usdt": -1e999}}')) === "«importe_usdt» de «0xa::0» no es un número válido");
assert("un negativo guardado de antes bloquea aplicar otro cambio y dice cuál es",
  error({ "0xviejo::0": { coste_eur: -100 }, "0xnuevo::0": { nota: "hola" } }) === "«coste_eur» de «0xviejo::0» no puede ser negativo");
assert("tampoco en un campo que puede ser negativo (gp_eur)", /no es un número válido/.test(error(JSON.parse('{"0xa::0": {"gp_eur": -1e999}}'))));
assert("lo de antes sigue: una nota que no es texto", /La nota de «0xa::0»/.test(error({ "0xa::0": { nota: 5, importe_usdt: -1 } })));

console.log("\n" + oks + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
