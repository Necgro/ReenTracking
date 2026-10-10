/* Verificación headless de varios retoques de UI con DATOS 100 % SINTÉTICOS:
 *
 *  S1) 📊: «💼 Dinero invertido» es la primera tarjeta y su gráfico tiene el
 *      bocadillo de las barras: al pasar el ratón por un mes (mes y
 *      cantidad, con su punto), con el teclado (← → Fin, Esc) y para el
 *      lector de pantalla.
 *  S2) 📒: la nota personal va sobre amarillo pálido (también en oscuro).
 *  S3) 📒: «DeFi» pulsado se quita al entrar en el modo spam (allí no hay
 *      botones de arriba) y no vuelve al salir.
 *  S4) 🧾: las tarjetas del resumen con el borde más marcado y el título
 *      con una línea verde.
 *  S5) Con «DeFi» pulsado, «Ver spam (n)» cuenta todo el spam
 *      (A2); el foco sigue en el botón pulsado con el teclado (A3); la
 *      barra de 💰 en cinco casillas iguales también a 960 px (A4); un solo
 *      bocadillo a la vez en 📊 (A5) y, al repintar con otra serie, el
 *      mismo mes (A6).
 *  S6) 0 errores de consola.
 *
 * (La barra de 💰 en casillas iguales la mira verifyui6b.js B1; el botón
 * «DeFi» con los grupos, verifyfase7.js S2.)
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifysueltos1.js
 */
"use strict";
const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");
const esperar = ms => new Promise(s => setTimeout(s, ms));

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "1".repeat(40), POOL = "0x" + "a".repeat(40), OTRO = "0x" + "c".repeat(40), TOKEN = "0x" + "ab".repeat(20);
const DATOS = {
  W,
  cache: {
    contratos_aprendidos: { DEFI_POOL: { [POOL]: "Pool sintético" } },
    notas_personales: { rw: { texto: "Mi nota de prueba", modificado: null } },
  },
  registros: [
    ["c1", "COMPRA", "COSTE_BASE", { fecha: "2024-03-14 10:00:00", via_compra: "ONCHAIN", importe_usdt: 450, inmueble: "Toledo 1", contrato: TOKEN }],
    ["c2", "COMPRA", "COSTE_BASE", { fecha: "2024-05-09 10:00:00", via_compra: "ONCHAIN", importe_usdt: 76.5, inmueble: "Toledo 1", contrato: TOKEN }],
    ["rw", "REWARD", "RCM_REWARD", { origen: OTRO, destino: W }],
    ["mp", "MOVIMIENTO", "NEUTRO", { origen: W, destino: POOL }],
    ["sp", "SPAM", "SPAM", { origen: OTRO, destino: W }],
  ],
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });

  await page.goto(BASE + "index.html#dashboard", { waitUntil: "networkidle0" });
  await page.evaluate(d => {
    state.config = Object.assign({}, state.config, { wallet: d.W });
    state.cache = asegurarEstructuraCache(JSON.parse(JSON.stringify(d.cache)));
    state.registros = d.registros.map(([clave, categoria, subcategoria, o]) => Object.assign({
      clave, hash: clave, categoria, subcategoria, fuente: "ONCHAIN", contrato: "",
      fecha: "2026-03-01 10:00:00", token: "POL", simbolo: "POL", cantidad: 1, nota: "",
    }, o));
    // Dos repartos, para que 📊 tenga también las barras de 💰 Rendimientos.
    const csv = cargarCsvRendimientos(["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet",
      '"Prueba Cáceres 8 #11/2025",2025-11-30,"3,5",0,"3,5",0,"[\'0x' + "1".repeat(64) + '\']","[]",' + d.W,
      '"Prueba Cáceres 8 #12/2025",2025-12-31,"4,5",0,"4,5",0,"[\'0x' + "2".repeat(64) + '\']","[]",' + d.W].join("\n"));
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    renderDashboard();
  }, DATOS);
  await esperar(200);

  /* ============ S1) 📊 Dinero invertido ============ */
  const s1 = await page.evaluate(() => ({
    primera: document.querySelector("#tarjetaMetricas .dash-card h3").textContent,
    zonas: document.querySelectorAll(".dash-invertido .dash-col").length,
  }));
  assert("S1 -> «💼 Dinero invertido» es la primera tarjeta", s1.primera === "💼 Dinero invertido", s1);
  assert("S1 -> una zona por mes (mar, abr y may 2024)", s1.zonas === 3, s1);
  const zona = await page.evaluate(() => {
    const r = document.querySelectorAll(".dash-invertido .dash-col-zona")[1].getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
  await page.mouse.move(zona[0], zona[1]);
  await esperar(80);
  const raton = await page.evaluate(() => {
    const caja = document.querySelector(".dash-invertido"), tip = caja.querySelector(".dash-tip");
    const t = tip.getBoundingClientRect(), c = caja.getBoundingClientRect();
    return { texto: tip.hidden ? "" : tip.innerText.replace(/\s+/g, " "), dentro: t.left >= c.left - 1 && t.right <= c.right + 1,
      punto: getComputedStyle(caja.querySelectorAll(".dash-punto-sel")[1]).display,
      otro: getComputedStyle(caja.querySelectorAll(".dash-punto-sel")[0]).display };
  });
  assert("S1 -> al pasar el ratón por abril: «abr 2024 · Invertido 450,00 USD», dentro de la tarjeta",
    raton.texto === "abr 2024 Invertido 450,00 USD" && raton.dentro, raton);
  assert("S1 -> se ve el punto de ese mes, no el de los otros", raton.punto !== "none" && raton.otro === "none", raton);
  await page.mouse.move(1, 1);
  await esperar(80);
  assert("S1 -> al salir, el bocadillo se va", await page.evaluate(() => document.querySelector(".dash-invertido .dash-tip").hidden));
  await page.focus(".dash-invertido");
  await page.keyboard.press("End");
  await esperar(80);
  const teclado = await page.evaluate(() => ({
    tip: document.querySelector(".dash-invertido .dash-tip").innerText.replace(/\s+/g, " "),
    lector: document.querySelector(".dash-invertido").nextElementSibling.textContent,
  }));
  assert("S1 -> con el teclado (Fin): mayo, y el lector de pantalla lo oye",
    teclado.tip === "may 2024 Invertido 526,50 USD" && teclado.lector === "may 2024: invertido 526,50 USD.", teclado);
  await page.keyboard.press("ArrowLeft");
  await esperar(50);
  assert("S1 -> ← va al mes anterior", /^abr 2024/.test(await page.evaluate(() => document.querySelector(".dash-invertido .dash-tip").innerText)));
  await page.evaluate(() => renderDashboard());
  await esperar(50);
  const tras = await page.evaluate(() => ({ foco: document.activeElement.classList.contains("dash-invertido"),
    tip: document.querySelector(".dash-invertido .dash-tip").innerText.replace(/\s+/g, " ") }));
  assert("S1 -> al repintar, el gráfico sigue con el foco y su bocadillo", tras.foco && /^abr 2024/.test(tras.tip), tras);
  /* A6: una compra anterior cambia la serie: el bocadillo sigue en abril. */
  await page.evaluate(() => {
    state.registros = state.registros.concat([Object.assign({}, state.registros[0], { clave: "c0", hash: "c0", fecha: "2023-01-10 10:00:00", importe_usdt: 10 })]);
    renderDashboard();
  });
  await esperar(50);
  const a6 = await page.evaluate(() => document.querySelector(".dash-invertido .dash-tip").innerText.replace(/\s+/g, " "));
  assert("S5 -> A6: al repintar con un mes nuevo delante, el bocadillo sigue en abril", a6 === "abr 2024 Invertido 460,00 USD", a6);
  /* A5: con el de 💼 abierto (teclado), el ratón en una barra de 💰: uno solo. */
  const barra = await page.evaluate(() => {
    document.querySelector(".dash-apiladas").scrollIntoView({ block: "center" });
    const r = document.querySelector(".dash-apiladas .dash-col-zona").getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
  await page.mouse.move(barra[0], barra[1]);
  await esperar(80);
  const a5 = await page.evaluate(() => [...document.querySelectorAll("#tarjetaMetricas .dash-tip")].filter(t => !t.hidden).map(t => t.innerText.replace(/\s+/g, " ").slice(0, 8)));
  assert("S5 -> A5: un solo bocadillo a la vez (el de las barras)", a5.length === 1 && /^nov 2025/.test(a5[0]), a5);
  await page.mouse.move(1, 1);
  await page.focus(".dash-invertido");
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await esperar(50);
  assert("S1 -> Esc lo quita", await page.evaluate(() => document.querySelector(".dash-invertido .dash-tip").hidden));

  /* ============ S2) 📒 nota sobre amarillo pálido ============ */
  await page.evaluate(() => { location.hash = "#transacciones"; txRenderSeguro(true); });
  await esperar(300);
  const fondo = () => page.evaluate(() => {
    const n = document.querySelector('#txCuerpo tr.tx-fila-nota[data-clave="rw"] .tx-notap');
    return n ? getComputedStyle(n).backgroundColor : null;
  });
  const claro = await fondo();
  await page.evaluate(() => document.body.classList.add("dark"));
  const oscuro = await fondo();
  await page.evaluate(() => document.body.classList.remove("dark"));
  // Un amarillo claro: uno más fuerte destaca demasiado.
  assert("S2 -> la nota, sobre amarillo pálido", claro === "rgb(255, 252, 238)", claro);
  assert("S2 -> en oscuro, un amarillo oscuro", oscuro === "rgb(39, 37, 27)", oscuro);

  /* ============ S3) 📒 «DeFi» y el modo spam ============ */
  /* A3: con el teclado, el foco sigue en el botón pulsado. */
  await page.focus("#txTriaje [data-defi]");
  await page.keyboard.press("Enter");
  await esperar(150);
  const focoDefi = await page.evaluate(() => document.activeElement.hasAttribute("data-defi"));
  await page.keyboard.press("Enter");
  await page.focus('#txTriaje [data-grupo="neutro"]');
  await page.keyboard.press("Enter");
  await esperar(150);
  const focoGrupo = await page.evaluate(() => document.activeElement.getAttribute("data-grupo"));
  await page.keyboard.press("Enter");
  await esperar(150);
  assert("S5 -> A3: tras pulsar «DeFi» o «Neutros» con Intro, el foco sigue en ese botón", focoDefi && focoGrupo === "neutro", [focoDefi, focoGrupo]);
  const pulsado = () => page.evaluate(() => (document.querySelector("#txTriaje [data-defi]") || { getAttribute: () => "sin botón" }).getAttribute("aria-pressed"));
  await page.click("#txTriaje [data-defi]");
  await esperar(150);
  const antes = await pulsado();
  const verSpam = await page.evaluate(() => document.querySelector("#txRecuento [data-ver-spam]").textContent);
  assert("S5 -> A2: con «DeFi» pulsado, «Ver spam (1)» cuenta todo el spam (lo que se verá)", verSpam === "👁 Ver spam (1)", verSpam);
  await page.click("#txRecuento [data-ver-spam]");
  await esperar(150);
  const enSpam = await page.evaluate(() => [...document.querySelectorAll("#txCuerpo tr.tx-fila")].map(tr => tr.getAttribute("data-clave")));
  await page.click("#txRecuento [data-salir-spam]");
  await esperar(150);
  const despues = await pulsado();
  assert("S3 -> «DeFi» pulsado; en el modo spam se ve el spam (sin filtrar por DeFi) y al salir ya no está pulsado",
    antes === "true" && JSON.stringify(enSpam) === '["sp"]' && despues === "false", [antes, enSpam, despues]);

  /* ============ S4) 🧾 tarjetas del resumen ============ */
  const fi = await page.evaluate(() => {
    fiInyectarEstilos();
    const t = document.createElement("div");
    t.className = "fi-tarjeta";
    t.innerHTML = "<h3>Prueba</h3>";
    document.querySelector("#view-fiscal").appendChild(t);
    const r = { borde: getComputedStyle(t).borderTopColor, linea: getComputedStyle(t.querySelector("h3")).borderBottomColor,
      grosor: getComputedStyle(t.querySelector("h3")).borderBottomWidth };
    t.remove();
    return r;
  });
  // La línea de las tarjetas, la de los botones (--btn-bd).
  assert("S4 -> borde más marcado (--btn-bd) y título con una línea verde de 2 px",
    fi.borde === "rgb(169, 184, 172)" && fi.linea === "rgb(23, 122, 82)" && fi.grosor === "2px", fi);

  /* A4: la barra de 💰, cinco casillas iguales en una fila a 1400 y a 960 px. */
  await page.evaluate(() => { location.hash = "#rendimientos"; renderRendimientos(); });
  await esperar(200);
  const barraRd = () => page.evaluate(() => [...document.querySelectorAll("#rdTarjetaTotal .rd-tt-dato")]
    .map(d => { const r = d.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width)]; }));
  const ancho = await barraRd();
  await page.setViewport({ width: 960, height: 1000 });
  await esperar(200);
  const estrecho = await barraRd();
  await page.setViewport({ width: 1400, height: 1000 });
  const iguales = c => c.length === 5 && new Set(c.map(x => x[0])).size === 1 && Math.max(...c.map(x => x[1])) - Math.min(...c.map(x => x[1])) <= 1;
  assert("S5 -> A4: cinco casillas iguales en una fila, a 1400 y a 960 px", iguales(ancho) && iguales(estrecho), [ancho, estrecho]);

  assert("S6 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
