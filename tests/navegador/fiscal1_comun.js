/* Los datos sintéticos de 🧾 Fiscal, comunes a verifyfiscal1.js
 * y verify63.js: 3 inmuebles comprados por banco en 2024 y 2025 (lotes de
 * 100 €/token), uno de ellos con dos compras, repartos de 2024 a 2026 y
 * tipos del BCE de todos los días. Se monta en la página con
 * page.evaluate(montarFiscal1) (puppeteer pasa el texto de la función: no
 * puede usar nada de fuera).
 */
"use strict";
function montarFiscal1() {
  const W = "0x" + "11".repeat(20), REENTAL = "0x" + "77".repeat(20);
  const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 10) / 1000));
  const tok18 = u => (BigInt(Math.round(u * 1e6)) * 10n ** 12n).toString();
  const NOMBRES = ["Prueba Cáceres 8", "Prueba Fondo 1", "Prueba Sevilla 2"];
  const contrato = i => "0x" + ("a" + i).repeat(20);
  state.config = { wallet: W, vault: "", compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
  const cache = cacheVacia();
  let blk = 100, n = 0;
  const leg = (i, unidades, fecha) => ({ blockNumber: String(blk++), timeStamp: ts(...fecha), hash: "0x" + String(++n).padStart(4, "0") + "cd".repeat(30),
    from: REENTAL, to: W, contractAddress: contrato(i), value: tok18(unidades), tokenName: NOMBRES[i], tokenSymbol: "RPR" + i, tokenDecimal: "18" });
  NOMBRES.forEach((nombre, i) => {
    cache.catalogo_propiedades[contrato(i)] = { estado: "CONFIRMADA", nombre_reental: nombre, simbolo: "RPR" + i, primera_aparicion: "2024-03-01", refuerzos: ["nombre_csv"] };
    cache.transacciones.wallet_tokens.push(leg(i, 5 + i, [2024, 3, 1 + i]));
  });
  cache.transacciones.wallet_tokens.push(leg(0, 2, [2025, 2, 1]));   // segunda compra de Cáceres 8
  for (let d = Date.UTC(2024, 0, 1); d <= Date.UTC(2026, 11, 31); d += 864e5) {
    cache.tipos_bce[new Date(d).toISOString().slice(0, 10)] = 1.1;
  }
  state.cache = cache;
  const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
  const filas = [cab];
  let h = 0;
  for (const [y, m] of [[2024, 6], [2024, 12], [2025, 6], [2025, 12], [2026, 3]]) {
    NOMBRES.forEach(nombre => {
      const fecha = y + "-" + String(m).padStart(2, "0") + "-10";
      filas.push("\"" + nombre + "#" + y + "-" + m + "\"," + fecha + ",3,0,3,0,\"['0x" + String(++h).padStart(64, "0") + "']\",\"[]\"," + W);
    });
  }
  const csv = cargarCsvRendimientos(filas.join("\n"));
  if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
  state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
  window.escribirArchivoNavegador = async () => {};
}

module.exports = montarFiscal1;
