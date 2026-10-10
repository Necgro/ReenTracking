/* Verificación headless del informe para la Renta imprimible,
 * js/27: Chrome local + puppeteer-core sobre http://localhost:8765.
 * DATOS 100 % SINTÉTICOS: los de verifyfiscal1 (fiscal1_comun.js) y un
 * informe hecho a mano con cifras y nombres largos. Capturas cap_63_*.png.
 *
 *  S1) pdfImprimir abre el diálogo de imprimir de un marco oculto con el
 *      informe del año (el de 🧾 Fiscal), con su título; la pestaña
 *      abierta no cambia (ni el tema oscuro ni lo plegado) y el título de
 *      la ventana vuelve a ser el de antes, y el foco al botón que lo tenía.
 *  S2) al terminar de imprimir se quita el marco; dos seguidas dejan uno.
 *  S3) el PDF que sale (Chrome, «Guardar como PDF»): A4 vertical, en claro,
 *      I en la primera hoja y II, III y IV cada uno en hoja nueva, con el
 *      pie «Página n de N» y la wallet en todas, y las cifras del resumen
 *      de 🧾 Fiscal.
 *  S4) con las cifras más largas que caben y nombres largos, nada se sale
 *      de la hoja ni de su columna y ninguna cifra se parte (A4); el tema oscuro de la app no llega al papel.
 *  S5) 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés y
 * Python con PyMuPDF, para leer el PDF):
 *   node tests/navegador/verify63.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const montarFiscal1 = require("./fiscal1_comun");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");
const OUT = __dirname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "verify63-"));
process.on("exit", () => fs.rmSync(TMP, { recursive: true, force: true }));

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const esperar = ms => new Promise(s => setTimeout(s, ms));

/* Lee los PDF con PyMuPDF, en una sola llamada: de cada hoja, su tamaño,
   su texto y lo que se sale (palabras más allá del margen derecho o que
   pisan la columna de al lado) o se parte (una cifra en dos líneas), y
   guarda la imagen de las primeras.
   pdfs: [{ ruta, prefijo, n }]. */
function leerPdfs(pdfs) {
  const guion = String.raw`
import fitz, json, re, sys
todos = []
for pdf in json.loads(sys.stdin.read()):
    hojas = []
    for i, p in enumerate(fitz.open(pdf["ruta"])):
        palabras = p.get_text("words")
        fuera = [w[4] for w in palabras if w[2] > p.rect.width - 14 * 72 / 25.4 + 1]
        pisan, partidas = [], []
        for t in p.find_tables(strategy="lines").tables:
            for fila in t.rows:
                for c in filter(None, fila.cells):
                    r = fitz.Rect(c)
                    dentro = p.get_text("words", clip=r + (-1, 0, 0, 1))
                    pisan += [w[4] for w in dentro if w[2] > r.x1 - 1 > w[0]]
                    junta = "".join(w[4] for w in dentro)
                    if len({round(w[3]) for w in dentro}) > 1 and re.fullmatch(r"[+-]?[0-9.]+(,[0-9]+)?\*?", junta):
                        partidas.append(junta)
        hojas.append({"ancho": round(p.rect.width), "alto": round(p.rect.height), "texto": p.get_text(), "fuera": fuera, "pisan": pisan, "partidas": partidas})
        if i < pdf["n"]: p.get_pixmap(dpi=70).save(pdf["prefijo"] + "_" + str(i + 1) + ".png")
    todos.append(hojas)
print(json.dumps(todos))`;
  // La última línea: PyMuPDF escribe consejos antes.
  return JSON.parse(execFileSync("python", ["-c", guion], { input: JSON.stringify(pdfs), encoding: "utf8",
    maxBuffer: 1 << 28 }).trim().split("\n").pop());
}

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

  await page.goto(BASE + "index.html#fiscal", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.setItem("reental_dark", "1"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montarFiscal1);
  await page.evaluate(() => { state.config.inversor = { nombre: "Persona de Prueba", nif: "00000000T" }; });
  await page.evaluate(() => { ejecutarClasificacion({ silencioso: true }); });
  await esperar(300);
  await page.evaluate(() => { apuntarSincronizacion(state.cache, true, new Date("2026-05-20T12:00:00Z")); renderPanel(); });
  await esperar(200);

  /* ============ S1) imprimir ============ */
  // El diálogo de imprimir del marco, apuntado (Chrome sin ventana no lo abre).
  const s1 = await page.evaluate(() => {
    const avisos = [];
    window.addEventListener("beforeprint", () => avisos.push("ventana"));
    const r = fiResultado();
    const plegados = document.querySelectorAll("#fiCuerpo details:not([open])").length;
    // El foco, en un botón de la pestaña.
    const boton = document.querySelector(".fi-anio");
    boton.focus();
    const titulo = document.title, hash = location.hash;
    // Chrome sin ventana no abre el diálogo: el print() del marco, en
    // cuanto el marco entra en la página, apunta lo que hay en ese momento.
    const vistos = [];
    const meter = document.body.appendChild;
    document.body.appendChild = function (n) {
      const x = meter.call(this, n);
      if (n.tagName === "IFRAME") {
        n.contentWindow.print = () => vistos.push({ titulo: document.title, html: n.contentDocument.documentElement.outerHTML,
          focoEnMarco: document.activeElement === n,
          oculto: getComputedStyle(n).visibility === "hidden" && n.offsetWidth === 0 });
      }
      return x;
    };
    try { pdfImprimir(r.informes[2025]); } finally { delete document.body.appendChild; }
    const marco = document.getElementById("pdfMarco");
    return { vistos: vistos.map(v => ({ titulo: v.titulo, oculto: v.oculto, focoEnMarco: v.focoEnMarco })), html: vistos[0]?.html,
      tituloDespues: document.title, titulo, hash, hashDespues: location.hash, avisos, oscuro: document.body.classList.contains("dark"),
      plegados, plegadosDespues: document.querySelectorAll("#fiCuerpo details:not([open])").length,
      marco: !!marco, ariaHidden: marco && marco.getAttribute("aria-hidden"), focoVuelve: document.activeElement === boton,
      resumen: Object.fromEntries(r.informes[2025].resumen.map(f => [f.clave, f.unidad === "EUR" ? fiEur(f.importe, FI_CON_SIGNO.has(f.clave)) : null])),
      enPantalla: Object.fromEntries([...document.querySelectorAll("#fiResumen .fi-fila")].map(x => [x.dataset.clave, x.querySelector(".v").textContent])) };
  });
  assert("S1 -> se abre el diálogo de imprimir una vez, de un marco oculto", s1.vistos.length === 1 && s1.vistos[0].oculto === true &&
    s1.marco && s1.ariaHidden === "true", s1.vistos);
  assert("S1 -> mientras, la ventana se llama como el PDF; después, como antes",
    s1.vistos[0]?.titulo === "Informe para la Renta 2025" && s1.tituloDespues === s1.titulo, [s1.vistos[0]?.titulo, s1.tituloDespues]);
  assert("S1 -> A9: mientras se imprime el foco está en el marco y después vuelve al botón que lo tenía",
    s1.vistos[0]?.focoEnMarco === true && s1.focoVuelve === true, [s1.vistos[0]?.focoEnMarco, s1.focoVuelve]);
  assert("S1 -> el marco lleva el informe de 2025, con su título",
    /<title>Informe para la Renta 2025<\/title>/.test(s1.html) && /Informe para la Renta · Ejercicio 2025/.test(s1.html));
  assert("S1 -> la pestaña abierta no cambia (sigue 🧾, en oscuro, lo plegado plegado) y no se imprime la ventana",
    s1.hashDespues === s1.hash && s1.oscuro && s1.plegados === s1.plegadosDespues && s1.avisos.length === 0,
    [s1.hashDespues, s1.oscuro, s1.plegados, s1.plegadosDespues, s1.avisos]);

  /* ============ S2) al terminar, se quita ============ */
  const s2 = await page.evaluate(async () => {
    document.getElementById("pdfMarco").contentWindow.dispatchEvent(new Event("afterprint"));
    await new Promise(r => setTimeout(r, 50));
    const quitado = !document.getElementById("pdfMarco");
    const inf = fiResultado().informes[2025];
    // Chrome sin ventana no se para en print(): dos seguidas.
    pdfImprimir(inf); pdfImprimir(inf);
    const marcos = document.querySelectorAll("iframe#pdfMarco").length;
    return { quitado, marcos };
  });
  assert("S2 -> al terminar de imprimir se quita el marco", s2.quitado);
  assert("S2 -> dos seguidas dejan un solo marco", s2.marcos === 1, s2.marcos);

  /* ============ S3 y S4) los PDF ============ */
  // S4: un informe con las cifras más largas que caben (importes de
  // 999.999,99 y cantidades de 123.456,123456) y nombres largos.
  const ancho = await page.evaluate(() => {
    const largo = "Inmueble con un nombre larguísimo para ver si parte bien la línea";
    const venta = (i, op) => ({ activo: i % 2 ? "USDT" : largo, operacion: op, tipo_activo: "Security token",
      fecha_adquisicion: "2024-01-0" + (1 + i), adquirido_por_canje: i === 1, fecha_transmision: "2025-06-01",
      cantidad: 123456.123456, valor_adquisicion_usd: 999999.99, valor_adquisicion_eur: 888888.88,
      valor_transmision_usd: 999999.99, valor_transmision_eur: 777777.77, gp_eur: -999999.99 });
    const total = { valor_adquisicion_usd: 999999.99, valor_adquisicion_eur: 999999.99, valor_transmision_usd: 999999.99,
      valor_transmision_eur: 999999.99, gp_eur: 999999.99 };
    const inf = structuredClone(fiResultado().informes[2025]);
    inf.detalle.ventas_inmuebles = { filas: [venta(0), venta(1)], total, a_declarar_en: "Ganancias" };
    inf.detalle.permutas = { filas: [venta(0, "Pago de " + largo), venta(1, "Cambio por otra moneda")], total, a_declarar_en: "Ganancias" };
    inf.detalle.rendimientos.filas = inf.detalle.rendimientos.filas.map(f => Object.assign({}, f, { inmueble: largo,
      integro_usd: 999999.99, integro_eur: 999999.99, retencion_usd: 999999.99, retencion_eur: 999999.99, pct_retencion: 19,
      neto_usd: -999999.99, neto_eur: -999999.99 }));
    inf.avisos.push({ fecha: "2025-01-01", tipo: "revisar", concepto: largo, detalle: largo.repeat(5) });
    return pdfHtml(inf);
  });
  // Lo que saca Chrome con «Guardar como PDF».
  const pdfPagina = await browser.newPage();
  const pdfs = [];
  for (const [html, nombre, n] of [[s1.html, "informe", 3], [ancho, "cifras_grandes", 4]]) {
    await pdfPagina.setContent(html, { waitUntil: "load" });
    const ruta = path.join(TMP, nombre + ".pdf");
    await pdfPagina.pdf({ path: ruta, preferCSSPageSize: true, printBackground: true });
    pdfs.push({ ruta, prefijo: path.join(OUT, "cap_63_" + nombre), n });
  }
  const claro = await pdfPagina.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [hojas, grandes] = leerPdfs(pdfs);

  assert("S3 -> A4 vertical (595 × 842 puntos)", hojas.every(h => h.ancho === 595 && h.alto === 842), hojas.map(h => [h.ancho, h.alto]));
  // La primera línea de la hoja, sin las del pie.
  const primera = h => h.texto.split("\n").find(l => l.trim() && !/^(Página \d|Wallet |Este documento)/.test(l)) || "";
  const conII = hojas.findIndex(h => h.texto.includes("II. Inversiones activas a"));
  const conIII = hojas.findIndex(h => h.texto.includes("III. Detalle"));
  const conIV = hojas.findIndex(h => h.texto.includes("IV. Avisos y datos a revisar"));
  assert("S3 -> I en la primera hoja; II, III y IV cada uno en hoja nueva, en orden",
    hojas[0].texto.includes("I. Resumen del ejercicio") && conII === 1 && conIII > conII && conIV > conIII &&
    /^II\. /.test(primera(hojas[conII])) && /^III\. /.test(primera(hojas[conIII])) && /^IV\. /.test(primera(hojas[conIV])),
    [conII, conIII, conIV].map(i => i >= 0 && primera(hojas[i])));
  assert("S3 -> en cada hoja, «Página n de " + hojas.length + "», la wallet y el aviso",
    hojas.every((h, i) => h.texto.includes("Página " + (i + 1) + " de " + hojas.length) && h.texto.includes("Wallet 0x" + "11".repeat(20)) &&
      h.texto.includes("Este documento no sustituye al asesoramiento fiscal profesional.")), hojas.map(h => h.texto.slice(0, 120)));
  const textoPdf = hojas.map(h => h.texto).join("\n");
  const faltan = Object.entries(s1.resumen).filter(([, v]) => v && !textoPdf.includes(v)).map(([k]) => k);
  assert("S3 -> las cifras del resumen son las de 🧾 Fiscal", faltan.length === 0 &&
    Object.entries(s1.resumen).every(([k, v]) => !v || s1.enPantalla[k] === v), faltan);
  assert("S3 -> con el titular y sin «qué tipo de rendimiento son»",
    textoPdf.includes("Persona de Prueba") && !textoPdf.includes("Cesión a terceros"));
  assert("S3 -> nada se sale de la hoja", hojas.every(h => !h.fuera.length && !h.pisan.length), hojas.map(h => [h.fuera, h.pisan]));
  assert("S4 -> con cifras de 999.999,99 y 123.456,123456 y nombres largos, nada se sale de la hoja ni de su columna",
    grandes.every(h => !h.fuera.length && !h.pisan.length), grandes.map(h => [h.fuera, h.pisan]).filter(x => x[0].length || x[1].length));
  const partidas = [...hojas, ...grandes].flatMap(h => h.partidas);
  assert("S4 -> A4: ninguna cifra partida en dos líneas", partidas.length === 0, partidas);
  assert("S4 -> en claro aunque la app esté en oscuro", claro === "rgb(255, 255, 255)", claro);

  /* ============ S5) errores ============ */
  assert("S5 -> 0 errores en la consola", errores.length === 0, errores);

  await browser.close();
  console.log("\n" + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
