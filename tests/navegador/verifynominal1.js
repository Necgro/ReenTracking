/* Arnés del interruptor «Valor nominal» de 📊 «💼 Dinero invertido»
 * (NOMINAL-1), con datos inventados: un proyecto en € pagado en USDT
 * (1 token a 108 $, BCE 1,08) y uno en $ (2 tokens a 100 $).
 *
 *  N1) apagado al entrar: lo pagado, el interruptor y «≈ 308,00 USD».
 *  N2) encendido: «100,00 € · 200,00 $», ≈ USD con el BCE, «Ver el
 *      detalle» y sin gráfico; el foco sigue en el interruptor.
 *  N3) la ventana: dos grupos, Esc la cierra y el foco vuelve al botón.
 *  N4) un repintado estando en 📊 lo deja encendido; volver desde otra
 *      pestaña, apagado.
 *  N5) al imprimir, lo pagado; después, otra vez encendido. Con la
 *      ventana abierta, se cierra (auditoría F1); y al ir a otra pestaña
 *      también (F6).
 *  N6) oscuro y 0 errores.
 *
 * DATOS 100 % SINTÉTICOS. Ejecución (servidor en 8765 y NODE_PATH a
 * puppeteer-core):  node tests/navegador/verifynominal1.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");
const OUT = __dirname;

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const esperar = ms => new Promise(s => setTimeout(s, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run", "--no-default-browser-check"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });
  await page.goto(BASE + "index.html#dashboard", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });

  await page.evaluate(() => {
    const W = "0x" + "11".repeat(20), T = "0x" + "77".repeat(20), P1 = "0x" + "a1".repeat(20), P2 = "0x" + "a2".repeat(20);
    state.config = { wallet: W, vault: "", compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" },
                                   [P2]: { estado: "CONFIRMADA", nombre_reental: "Prueba Ribera 2", simbolo: "RRIB2" } };
    const ts = String(Math.floor(Date.UTC(2024, 2, 1, 9) / 1000));
    cache.transacciones.wallet_tokens.push(
      { blockNumber: "50", timeStamp: ts, hash: "0x0001" + "ab".repeat(30), from: T, to: W, contractAddress: P1,
        value: (10n ** 18n).toString(), tokenName: "Prueba Alcazaba 1", tokenSymbol: "RALC1", tokenDecimal: "18" },
      { blockNumber: "51", timeStamp: ts, hash: "0x0002" + "ab".repeat(30), from: T, to: W, contractAddress: P2,
        value: (2n * 10n ** 18n).toString(), tokenName: "Prueba Ribera 2", tokenSymbol: "RRIB2", tokenDecimal: "18" });
    cache.tipos_bce = { "2024-03-01": 1.08 };
    state.cache = cache;
    const compra = (k, c, cantidad, usd) => ({ clave: k, fecha: "2024-03-01 10:00:00", categoria: "COMPRA", subcategoria: "COSTE_BASE",
      hash: "0x" + k.padStart(64, "0"), inmueble: "Prueba", contrato: c, via_compra: "ONCHAIN", cantidad, importe_usdt: usd });
    state.registros = [compra("1", P1, 1, 108), compra("2", P2, 2, 200)];
    renderDashboard();
  });
  const tarjeta = () => page.evaluate(() => {
    const c = document.querySelector("#tarjetaMetricas .dash-card");
    return { texto: c.innerText.replace(/\s+/g, " "), grafico: !!c.querySelector(".dash-invertido"),
      on: !!c.querySelector(".dash-nominal-sw input:checked"), detalle: !!c.querySelector(".dash-ver-detalle") };
  });

  console.log("== N1. Apagado al entrar ==");
  let t = await tarjeta();
  assert("lo pagado (308,00 USD), el interruptor apagado con «≈ 308,00 USD» y el gráfico",
    t.texto.includes("308,00 USD") && t.texto.includes("Valor nominal ≈ 308,00 USD") && !t.on && t.grafico && !t.detalle, t);

  console.log("== N2. Encendido ==");
  await page.click(".dash-nominal-sw");
  await esperar(150);
  t = await tarjeta();
  assert("«100,00 € · 200,00 $», ≈ USD con el BCE y «Ver el detalle»; sin gráfico",
    /100,00 €\s*·\s*200,00 \$/.test(t.texto) && t.texto.includes("≈ 308,00 USD (€ al BCE del 01/03/2024, 1,0800)") && t.on && t.detalle && !t.grafico, t);
  assert("el foco sigue en el interruptor", await page.evaluate(() => document.activeElement.matches(".dash-nominal-sw input")));
  await (await page.$("#tarjetaMetricas .dash-card")).screenshot({ path: path.join(OUT, "cap_nominal1_encendido.png") });

  console.log("== N3. La ventana del detalle ==");
  await page.click(".dash-ver-detalle");
  await esperar(150);
  const dlg = await page.evaluate(() => {
    const d = document.querySelector("dialog.dash-dlg");
    return d && { abierta: d.open, texto: d.innerText.replace(/\s+/g, " "), ancho: d.getBoundingClientRect().width,
      foco: d.contains(document.activeElement) };
  });
  assert("abierta, con el foco dentro, en € y en $ (sin «Sin compra»), 640 px",
    dlg && dlg.abierta && dlg.foco && dlg.texto.includes("Proyectos en € Prueba Alcazaba 1 1,00 100,00 € 108,00 $") &&
    dlg.texto.includes("Proyectos en $ Prueba Ribera 2 2,00 200,00 $ 200,00 $") && !dlg.texto.includes("Sin compra") &&
    Math.round(dlg.ancho) === 640, dlg);
  await (await page.$("dialog.dash-dlg")).screenshot({ path: path.join(OUT, "cap_nominal1_detalle.png") });
  // Un repintado con la ventana abierta no la quita.
  await page.evaluate(() => renderDashboard());
  assert("un repintado no cierra la ventana", await page.evaluate(() => !!document.querySelector("dialog.dash-dlg[open]")));
  await page.keyboard.press("Escape");
  await esperar(150);
  assert("Esc la cierra (y la quita) y el foco vuelve a «Ver el detalle»", await page.evaluate(() =>
    !document.querySelector("dialog.dash-dlg") && document.activeElement.matches(".dash-ver-detalle")));

  console.log("== N4. Repintar y volver a 📊 ==");
  await page.evaluate(() => renderDashboard());
  assert("repintado estando en 📊: sigue encendido", (await tarjeta()).on);

  console.log("== N5. Imprimir ==");
  await page.evaluate(() => exAntesDeImprimir());
  t = await tarjeta();
  assert("al imprimir, lo pagado y el gráfico", !t.on && t.grafico, t);
  await page.evaluate(() => exDespuesDeImprimir());
  assert("después, otra vez encendido", (await tarjeta()).on);
  await page.click(".dash-ver-detalle");
  await esperar(150);
  await page.evaluate(() => exAntesDeImprimir());
  const conVentana = await page.evaluate(() => ({ ventana: !!document.querySelector("dialog.dash-dlg"), t: null }));
  t = await tarjeta();
  assert("F1: con la ventana abierta, al imprimir se cierra y sale lo pagado", !conVentana.ventana && !t.on && t.grafico, { conVentana, t });
  await page.evaluate(() => exDespuesDeImprimir());
  await page.click(".dash-ver-detalle");
  await esperar(150);

  await page.evaluate(() => { location.hash = "#fiscal"; });
  await esperar(150);
  assert("F6: al ir a otra pestaña, la ventana se cierra", await page.evaluate(() => !document.querySelector("dialog.dash-dlg")));
  await esperar(150);
  await page.evaluate(() => { location.hash = "#dashboard"; });
  await esperar(200);
  assert("al volver desde otra pestaña: apagado", !(await tarjeta()).on);

  console.log("== N6. Oscuro y errores ==");
  await page.evaluate(() => { document.body.classList.add("dark"); });
  await page.click(".dash-nominal-sw");
  await esperar(150);
  await (await page.$("#tarjetaMetricas .dash-card")).screenshot({ path: path.join(OUT, "cap_nominal1_oscuro.png") });
  const colores = await page.evaluate(() => {
    const c = getComputedStyle(document.querySelector("#tarjetaMetricas .dash-value-lg"));
    return { color: c.color, tam: c.fontSize };
  });
  assert("cifra de 36 px y clara en oscuro", colores.tam === "36px" && colores.color !== "rgb(24, 36, 32)", colores);
  assert("0 errores de consola", errores.length === 0, errores);

  await browser.close();
  console.log("\n" + ok + " OK, " + fallos + " FALLOS");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
