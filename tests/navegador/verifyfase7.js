/* Verificación headless del menú y el filtro «DeFi» con DATOS 100 % SINTÉTICOS
 * (lo mismo que verifyfase7_real.js, sin necesitar privado/datos_reales/):
 *
 *  S1) el menú tiene 8 vistas (con 📖 Ayuda), sin 🏦 Vault ni ⚡ DeFi RNT.
 *  S2) el botón «DeFi» de arriba repinta la tabla con lo DeFi (recompensa,
 *      pool, el gas de usarlo y el de un approve a un contrato DeFi) y el
 *      recuento lo dice; se suma a «Neutros» y «Con efecto fiscal»;
 *      «Limpiar filtros» lo quita.
 *  S3) un contrato DeFi añadido sin reclasificar no cambia
 *      lo que enseña el filtro; al reclasificar, sí.
 *  S4) un enlace viejo a #defi abre 📒 Transacciones y uno a
 *      #vault, 📊 Dashboard.
 *  S5) 0 errores de consola.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyfase7.js
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

const W = "0x" + "1".repeat(40), POOL = "0x" + "a".repeat(40), OTRO = "0x" + "c".repeat(40),
      TOKEN = "0x" + "d".repeat(40), NUEVO = "0x" + "e".repeat(40);
const approve = s => "0x095ea7b3" + "0".repeat(24) + s.slice(2) + "f".repeat(64);
const DATOS = {
  W, POOL, NUEVO,
  cache: {
    contratos_aprendidos: { DEFI_POOL: { [POOL]: "Pool sintético" }, DISTRIBUIDOR: { [OTRO]: "Reparto" } },
    transacciones: { wallet_normales: [{ hash: "0xap", from: W, to: TOKEN, input: approve(POOL) }] },
  },
  registros: [
    ["rw", "REWARD", "RCM_REWARD", { origen: OTRO, destino: W }],
    ["mp", "MOVIMIENTO", "NEUTRO", { origen: W, destino: POOL }],
    ["gp", "COMISION", "NEUTRO", { hash: "mp", origen: W, destino: POOL }],
    ["ga", "COMISION", "NEUTRO", { hash: "0xap", origen: W, destino: TOKEN }], // gas del approve
    ["mn", "MOVIMIENTO", "NEUTRO", { origen: W, destino: NUEVO }],             // S3: DeFi solo tras reclasificar
    ["gn", "COMISION", "NEUTRO", { origen: W, destino: OTRO }],
    ["re", "RENDIMIENTO", "RCM_REINVERTIDO", { origen: OTRO, destino: W }],
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

  await page.goto(BASE + "index.html#transacciones", { waitUntil: "networkidle0" });
  const nav = await page.evaluate(() => [...document.querySelectorAll("#navPrincipal a")].map(a => a.getAttribute("href")));
  assert("S1 -> 8 vistas (con 📖 Ayuda), sin #vault ni #defi", nav.length === 8 && !nav.includes("#vault") && !nav.includes("#defi"), nav);

  /* Una clasificación inventada: registros puestos como los dejaría ejecutarClasificacion. */
  await page.evaluate(d => {
    state.config = Object.assign({}, state.config, { wallet: d.W });
    state.cache = asegurarEstructuraCache(JSON.parse(JSON.stringify(d.cache)));
    state.registros = d.registros.map(([clave, categoria, subcategoria, o], i) => Object.assign({
      clave, hash: clave, categoria, subcategoria, fuente: "ONCHAIN", contrato: "",
      fecha: "2026-03-0" + (i + 1) + " 10:00:00", token: "POL", simbolo: "POL", cantidad: 1, nota: "",
    }, o));
    txRenderSeguro(true);
  }, DATOS);
  await esperar(300);
  const leer = () => page.evaluate(() => ({
    filas: [...document.querySelectorAll("#txCuerpo tr.tx-fila")].map(tr => tr.getAttribute("data-clave")).sort(),
    rec: document.getElementById("txRecuento").textContent,
    valor: (b => b ? b.getAttribute("aria-pressed") : "")(document.querySelector("#txTriaje [data-defi]")),
    boton: (document.querySelector("#txTriaje [data-defi]") || {}).textContent || "",
  }));
  const antes = await leer();
  assert("S2 -> el botón dice «4 DeFi», sin pulsar", antes.boton === "4 DeFi" && antes.valor === "false", antes);
  await page.click("#txTriaje [data-defi]");
  await esperar(200);
  const defi = await leer();
  assert("S2 -> pulsado", defi.valor === "true", defi.valor);
  assert("S2 -> «Solo DeFi»: recompensa, pool, su gas y el gas del approve",
    JSON.stringify(defi.filas) === '["ga","gp","mp","rw"]', defi.filas);
  assert("S2 -> el recuento dice «4 de 7»", /^4 de 7\b/.test(defi.rec), defi.rec);
  await page.click('#txTriaje [data-grupo="neutro"]');
  await esperar(200);
  const neutros = await leer();
  assert("S2 -> «Neutros» y «DeFi» a la vez: el gas y el traspaso al pool", JSON.stringify(neutros.filas) === '["ga","gp","mp"]', neutros.filas);
  await page.click('#txTriaje [data-grupo="fiscal"]');
  await esperar(200);
  const fiscal = await leer();
  assert("S2 -> «Con efecto fiscal» y «DeFi»: la recompensa", JSON.stringify(fiscal.filas) === '["rw"]', fiscal.filas);
  await page.click('#txTriaje [data-grupo="fiscal"]');
  await esperar(200);

  /* S3: se añade un contrato DeFi sin reclasificar (como si la clasificación fallara). */
  await page.evaluate(d => { state.cache.contratos_aprendidos.DEFI_POOL[d.NUEVO] = "Nuevo"; txRenderSeguro(true); }, DATOS);
  await esperar(200);
  const sinReclasificar = await leer();
  assert("S3 -> sin reclasificar, lo mismo que antes", JSON.stringify(sinReclasificar.filas) === JSON.stringify(defi.filas),
    sinReclasificar.filas);
  await page.evaluate(() => { state.registros = state.registros.slice(); txRenderSeguro(true); });
  await esperar(200);
  const reclasificado = await leer();
  assert("S3 -> al reclasificar, también lo del contrato nuevo", reclasificado.filas.includes("mn"), reclasificado.filas);

  await page.click("#txLimpiar");
  await esperar(200);
  const limpio = await leer();
  assert("S2 -> «Limpiar filtros» quita «DeFi»", limpio.valor === "false" && limpio.filas.length === antes.filas.length, limpio);

  /* S4: enlaces viejos, al abrir la app. */
  for (const [viejo, vista] of [["defi", "transacciones"], ["vault", "dashboard"]]) {
    await page.goto(BASE + "index.html#" + viejo, { waitUntil: "networkidle0" });
    await esperar(300);
    const r = await page.evaluate(() => ({ hash: location.hash,
      activa: (document.querySelector(".view.active") || {}).id }));
    assert("S4 -> #" + viejo + " abre " + vista, r.hash === "#" + vista && r.activa === "view-" + vista, r);
  }

  assert("S5 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
