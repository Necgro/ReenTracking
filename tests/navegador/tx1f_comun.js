/* Comprobaciones de la tabla de 📒 Transacciones en el navegador, comunes a verifytx1f.js
 * (datos sintéticos) y verifytx1f_real.js (tus datos, solo en memoria).
 *
 * Con la página ya en #transacciones, clasificada y con escribirArchivoNavegador
 * capturado en window.__writes, comprueba:
 *  T1) 9 columnas en su orden, sin colgroup.
 *  T2) alineaciones MEDIDAS: cifras a la derecha; texto, token, contraparte
 *      y tx a la izquierda; fecha, categoría y botones centrados; todo
 *      centrado en vertical (el contenido de cada celda, a ±2 px del
 *      centro de su fila).
 *  T3) rejilla: sin bordes verticales; las líneas horizontales, más claras
 *      que la de la cabecera.
 *  T4) cabe sin scroll a 1366 px (también con el spam a la vista) y los
 *      iconos no se salen de su columna.
 *  T5) la flecha del sentido: la que dicen las funciones puras, en la misma
 *      vertical en todas las filas, con su burbuja al pasar el ratón y con
 *      el teclado, y fuera del texto de la operación.
 *  T6) contraparte: la de txContraparte, fila a fila.
 *  T7) nota debajo: el ✏️ abre el editor justo debajo de su fila (foco
 *      dentro), Intro guarda, la nota sale en cursiva en la fila de abajo
 *      y el foco vuelve al ✏️; Esc cancela sin escribir; lo escrito
 *      sobrevive a un repintado; solo un editor a la vez; borrar la quita.
 *  T8) misma huella de registros y cada escritura solo cambia
 *      notas_personales.
 */
"use strict";
const esperar = ms => new Promise(s => setTimeout(s, ms));

module.exports = async function comprobarTx1f(page, assert, opts = {}) {
  const pref = opts.prefijo || "";
  const huella = () => page.evaluate(() => JSON.stringify(state.registros));
  const huellaAntes = await huella();
  /* La cache sin las notas, con las claves ordenadas (la escritura puede
     ordenarlas de otra manera). */
  await page.evaluate(() => {
    window.__canon = v => Array.isArray(v) ? "[" + v.map(window.__canon).join(",") + "]"
      : v && typeof v === "object" ? "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + window.__canon(v[k])).join(",") + "}"
      : JSON.stringify(v);
  });
  const cacheAntes = await page.evaluate(() => { const c = JSON.parse(JSON.stringify(state.cache)); delete c.notas_personales; return window.__canon(c); });

  /* ============ T1) columnas ============ */
  const t1 = await page.evaluate(() => {
    const t = document.getElementById("txTabla");
    const ths = [...t.querySelectorAll("thead th")].map(th => {
      const c = th.cloneNode(true); c.querySelectorAll(".tx-burbuja").forEach(x => x.remove());
      return c.textContent.replace(/\s+/g, " ").trim();
    });
    const filas = [...document.querySelectorAll("#txCuerpo tr.tx-fila")];
    return { ths, colgroup: !!t.querySelector("colgroup"), n: filas.length, malas: filas.filter(tr => tr.children.length !== 9).length };
  });
  assert(pref + "T1 -> 9 columnas (D1): Fecha · Categoría · Token · Operación · Cantidad · Importe · Contraparte · Tx · Acciones",
    JSON.stringify(t1.ths.map(x => x.replace(/\s/g, ""))) ===
    JSON.stringify(["Fecha", "Categoría", "Token", "Operación", "Cantidad", "Importe(retención)", "Contraparte", "Tx", "Acciones"]), t1.ths);
  assert(pref + "T1 -> las " + t1.n + " filas tienen 9 celdas y no hay colgroup", t1.n > 0 && t1.malas === 0 && !t1.colgroup, t1);

  /* ============ T2) alineaciones medidas ============ */
  const t2 = await page.evaluate(() => {
    const esperado = ["center", "center", "left", "left", "right", "right", "left", "left", "center"];
    const filas = [...document.querySelectorAll("#txCuerpo tr.tx-fila")];
    const malH = {}, malV = [], malCentro = [];
    const th = [...document.querySelectorAll("#txTabla thead th")].map(x => getComputedStyle(x).textAlign);
    for (const tr of filas) {
      const rf = tr.getBoundingClientRect();
      [...tr.children].forEach((td, i) => {
        const cs = getComputedStyle(td);
        const al = cs.textAlign === "start" ? "left" : cs.textAlign === "end" ? "right" : cs.textAlign;
        if (al !== esperado[i]) malH[i] = (malH[i] || 0) + 1;
        if (cs.verticalAlign !== "middle") malV.push(i);
        /* Centro vertical del contenido frente al de la fila. */
        const r = document.createRange(); r.selectNodeContents(td);
        const rs = [...r.getClientRects()].filter(x => x.height > 0 && x.width > 0);
        if (!rs.length) return;
        const top = Math.min(...rs.map(x => x.top)), bottom = Math.max(...rs.map(x => x.bottom));
        const d = Math.abs((top + bottom) / 2 - (rf.top + rf.bottom) / 2);
        if (d > 2.5) malCentro.push({ col: i, d: Math.round(d * 10) / 10 });
      });
    }
    /* Medida real en el sitio: las cifras de la columna Cantidad acaban a
       la misma x; las fechas y los botones, centrados en su celda. */
    const finCant = new Set(), desvFecha = [], desvAcc = [];
    for (const tr of filas.slice(0, 200)) {
      const c = tr.children[4];
      if (c.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(c); finCant.add(Math.round(r.getBoundingClientRect().right)); }
      for (const [i, lista] of [[0, desvFecha], [8, desvAcc]]) {
        const td = tr.children[i], rt = td.getBoundingClientRect();
        const r = document.createRange(); r.selectNodeContents(td); const rc = r.getBoundingClientRect();
        lista.push(Math.abs((rc.left + rc.right) / 2 - (rt.left + rt.right) / 2));
      }
    }
    return { malH, malV: malV.length, malCentro: malCentro.slice(0, 5), nMalCentro: malCentro.length, th,
             finCant: [...finCant], maxFecha: Math.max(...desvFecha), maxAcc: Math.max(...desvAcc) };
  });
  assert(pref + "T2 -> alineación horizontal de D3 en todas las celdas (cifras a la derecha; texto a la izquierda; fecha, categoría y botones centrados)",
    Object.keys(t2.malH).length === 0, t2.malH);
  assert(pref + "T2 -> la cabecera, alineada como su columna", JSON.stringify(t2.th.map(a => a === "start" ? "left" : a)) ===
    JSON.stringify(["center", "center", "left", "left", "right", "right", "left", "left", "center"]), t2.th);
  assert(pref + "T2 -> medido: las cantidades acaban en la misma x; fechas y botones centrados en su celda (±1,5 px)",
    t2.finCant.length <= 1 && t2.maxFecha <= 1.5 && t2.maxAcc <= 1.5, { finCant: t2.finCant, fecha: t2.maxFecha, acc: t2.maxAcc });
  assert(pref + "T2 -> todo centrado en vertical: vertical-align middle y el contenido a ±2,5 px del centro de su fila",
    t2.malV === 0 && t2.nMalCentro === 0, { malV: t2.malV, n: t2.nMalCentro, ej: t2.malCentro });

  /* ============ T3) rejilla ============ */
  const t3 = await page.evaluate(() => {
    const celdas = [...document.querySelectorAll("#txTabla th, #txCuerpo tr.tx-fila td, #txCuerpo tr.tx-fila-nota td")];
    const verticales = celdas.filter(c => { const s = getComputedStyle(c); return parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0; }).length;
    const td = document.querySelector("#txCuerpo tr.tx-fila:not(.tx-con-notap) td");
    const th = document.querySelector("#txTabla thead th");
    /* Claridad de un color pintado sobre el panel (la línea de las filas
       es un gris, no transparente): se pinta 1 px en un lienzo y se mide su
       luminosidad. */
    const luz = c => { const x = document.createElement("canvas").getContext("2d");
      x.fillStyle = getComputedStyle(document.body).backgroundColor; x.fillRect(0, 0, 1, 1);
      x.fillStyle = c; x.fillRect(0, 0, 1, 1); const [r, g, b] = x.getImageData(0, 0, 1, 1).data; return r + g + b; };
    const sTd = getComputedStyle(td), sTh = getComputedStyle(th);
    return { verticales, tdAncho: sTd.borderBottomWidth, tdColor: sTd.borderBottomColor, thColor: sTh.borderBottomColor,
             tdLuz: luz(sTd.borderBottomColor), thLuz: luz(sTh.borderBottomColor), alto: td.parentElement.getBoundingClientRect().height };
  });
  assert(pref + "T3 -> sin líneas verticales en ninguna celda", t3.verticales === 0, t3);
  assert(pref + "T3 -> la línea horizontal de las filas es fina y más clara que la de la cabecera; filas con aire (≥ 40 px)",
    t3.tdAncho === "1px" && t3.tdLuz > t3.thLuz && t3.alto >= 40, t3);

  /* ============ T4) cabe a 1366 px ============ */
  const t4 = await page.evaluate(() => {
    const w = document.querySelector(".tx-tablawrap");
    const acc = [...document.querySelectorAll("#txCuerpo td.tx-acciones")];
    return { ancho: window.innerWidth, sw: w.scrollWidth, cw: w.clientWidth,
             desbordan: acc.filter(td => td.scrollWidth > td.clientWidth + 1).length,
             pagina: document.documentElement.scrollWidth <= window.innerWidth };
  });
  assert(pref + "T4 -> a 1366 px cabe sin scroll (tabla y página) y los iconos no se salen",
    t4.ancho === 1366 && t4.sw <= t4.cw + 1 && t4.desbordan === 0 && t4.pagina, t4);
  /* También con el spam a la vista: sus nombres pueden ser URL sin
     espacios, que no deben ensanchar la tabla. */
  const conSpam = await page.evaluate(() => {
    const b = document.querySelector("#txRecuento [data-ver-spam]");
    if (!b) return null;
    b.click(); // el modo spam (solo el spam); se sale con «Salir del spam»
    const w = document.querySelector(".tx-tablawrap");
    const r = { sw: w.scrollWidth, cw: w.clientWidth, spam: document.querySelectorAll("#txCuerpo tr.tx-c-SPAM").length };
    document.querySelector("#txRecuento [data-salir-spam]").click();
    return r;
  });
  assert(pref + "T4 -> con el spam a la vista también cabe" + (conSpam ? " (" + conSpam.spam + " filas de spam)" : " (no hay spam)"),
    !conSpam || conSpam.sw <= conSpam.cw + 1, conSpam);

  /* ============ T5) flecha del sentido ============ */
  const t5 = await page.evaluate(() => {
    const propias = { wallet: state.config.wallet, vault: state.config.vault };
    const porClave = new Map(state.registros.map(r => [r.clave, r]));
    const filas = [...document.querySelectorAll("#txCuerpo tr.tx-fila")];
    let malas = 0, enTexto = 0; const cuenta = {}; const xs = new Set();
    for (const tr of filas) {
      const s = txSentido(porClave.get(tr.getAttribute("data-clave")), propias) || "ninguno";
      cuenta[s] = (cuenta[s] || 0) + 1;
      const el = tr.children[3].querySelector(".tx-sentido");
      if (!el || !el.classList.contains("tx-s-" + s)) malas++;
      if (/[↓↑⇄]/.test(tr.children[3].textContent)) enTexto++;
      xs.add(Math.round(el.getBoundingClientRect().left));
    }
    const f = s => getComputedStyle(document.querySelector(".tx-s-" + s) || document.body, "::before");
    return { malas, enTexto, cuenta, xs: [...xs], flechas: ["entrada", "salida", "propias"].filter(s => document.querySelector(".tx-s-" + s)).map(s => [s, f(s).content, f(s).color]) };
  });
  assert(pref + "T5 -> cada fila lleva la flecha de su sentido (" + JSON.stringify(t5.cuenta) + ") y la flecha no está en el texto de la operación",
    t5.malas === 0 && t5.enTexto === 0, t5);
  assert(pref + "T5 -> todas las flechas en la misma vertical", t5.xs.length === 1, t5.xs);
  const colores = new Set(t5.flechas.map(f => f[2]));
  assert(pref + "T5 -> forma y color: ↓ ↑ ⇄, cada una de un color",
    t5.flechas.every(([s, c]) => c === { entrada: '"↓"', salida: '"↑"', propias: '"⇄"' }[s]) && colores.size === t5.flechas.length, t5.flechas);
  const selFlecha = await page.evaluate(() => {
    const el = document.querySelector("#txCuerpo .tx-sentido.tx-s-entrada") || document.querySelector("#txCuerpo .tx-sentido[tabindex]");
    el.scrollIntoView({ block: "center" });
    const tr = el.closest("tr");
    return '#txCuerpo tr.tx-fila[data-clave="' + CSS.escape(tr.getAttribute("data-clave")) + '"] .tx-sentido';
  });
  const burbuja = () => page.evaluate(sel => {
    const el = document.querySelector(sel); const s = getComputedStyle(el, "::after");
    return { display: s.display, texto: s.content, label: el.getAttribute("aria-label") };
  }, selFlecha);
  const quieta = await burbuja();
  await page.hover(selFlecha);
  await esperar(150);
  const raton = await burbuja();
  await page.mouse.move(5, 5);
  await page.evaluate(sel => {
    /* Llega con el teclado: Tab desde el elemento anterior que se enfoca. */
    const el = document.querySelector(sel);
    const enfocables = [...document.querySelectorAll("#txCuerpo [tabindex='0'], #txCuerpo button, #txCuerpo a")];
    const i = enfocables.indexOf(el);
    (enfocables[i - 1] || el).focus();
  }, selFlecha);
  await page.keyboard.press("Tab");
  await esperar(150);
  const teclado = await burbuja();
  const enfocada = await page.evaluate(sel => document.activeElement === document.querySelector(sel), selFlecha);
  assert(pref + "T5 -> la burbuja de la flecha: oculta, se ve al pasar el ratón y al llegar con el teclado; el texto, también en aria-label",
    quieta.display === "none" && raton.display === "block" && teclado.display === "block" && enfocada &&
    /^"(Entrada|Salida|Entre tus direcciones)"$/.test(raton.texto) && raton.label.startsWith(raton.texto.replace(/"/g, "") + ":"),
    { quieta, raton, teclado, enfocada });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());

  /* ============ T6) contraparte ============ */
  const t6 = await page.evaluate(() => {
    const dirs = { propias: { wallet: state.config.wallet, vault: state.config.vault }, nombres: txNombresContratos(state.cache) };
    const porClave = new Map(state.registros.map(r => [r.clave, r]));
    const filas = [...document.querySelectorAll("#txCuerpo tr.tx-fila")];
    let malas = 0, conNombre = 0, cortas = 0, sin = 0; const ej = [];
    for (const tr of filas) {
      const cp = txContraparte(porClave.get(tr.getAttribute("data-clave")), dirs);
      const td = tr.children[6];
      const bien = cp ? td.textContent === cp.texto && td.title === cp.ayuda : td.textContent === "—";
      if (!bien) { malas++; if (ej.length < 3) ej.push([td.textContent, cp]); }
      if (!cp) sin++; else if (cp.conocida) conNombre++; else if (/^0x[0-9a-f]{5}…[0-9a-f]{5}$/.test(td.textContent)) cortas++;
    }
    return { n: filas.length, malas, conNombre, cortas, sin, ej };
  });
  assert(pref + "T6 -> contraparte fila a fila como txContraparte (" + t6.conNombre + " con nombre, " + t6.cortas + " acortadas, " + t6.sin + " sin ella)",
    t6.malas === 0 && t6.conNombre + t6.cortas + t6.sin === t6.n && t6.conNombre > 0 && t6.cortas > 0, t6);

  /* ============ T7) nota debajo de la fila ============ */
  const clave = await page.evaluate(() => {
    const tr = document.querySelector("#txCuerpo tr.tx-fila:not(.tx-con-notap)");
    tr.scrollIntoView({ block: "center" });
    return tr.getAttribute("data-clave");
  });
  const lapiz = '#txCuerpo button[data-accion="nota"][data-clave="' + clave + '"]';
  const anchos = () => page.evaluate(() => [...document.querySelectorAll("#txTabla thead th")].map(th => Math.round(th.getBoundingClientRect().width)));
  const anchosAntes = await anchos();
  const escriturasAntes = await page.evaluate(() => window.__writes.length);
  await page.click(lapiz);
  await esperar(250);
  const abierto = await page.evaluate(clave => {
    const tr = document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + CSS.escape(clave) + '"]');
    const sig = tr.nextElementSibling;
    const t = sig && sig.querySelector("textarea.tx-nota-texto");
    return { debajo: !!(sig && sig.classList.contains("tx-fila-nota") && t), foco: document.activeElement === t,
             colspan: sig && sig.firstElementChild.colSpan, expandido: tr.querySelector('button[data-accion="nota"]').getAttribute("aria-expanded"),
             editores: document.querySelectorAll("#txCuerpo textarea.tx-nota-texto").length };
  }, clave);
  assert(pref + "T7 -> el ✏️ abre el editor en la fila de justo debajo, a lo ancho, con el foco dentro",
    abierto.debajo && abierto.foco && abierto.colspan === 9 && abierto.expandido === "true" && abierto.editores === 1, abierto);
  const anchosEditor = await anchos();
  await page.screenshot({ path: opts.capEditor });
  /* Larga a propósito: no debe ensanchar ninguna columna. */
  const texto = "Nota del arnés: gas de la compra de mayo, pagado desde otra red; " +
    "una nota larga a propósito para comprobar que no ensancha ninguna columna de la tabla ni la saca de su caja";
  await page.keyboard.type(texto.slice(0, 20));
  /* Un repintado (p. ej. de otra parte de la app) no pierde lo escrito. */
  await page.evaluate(() => txPintarCuerpoSeguro());
  await esperar(100);
  const trasRepintar = await page.evaluate(() => {
    const t = document.querySelector("#txCuerpo textarea.tx-nota-texto");
    return { valor: t && t.value, foco: document.activeElement === t };
  });
  assert(pref + "T7 -> lo escrito sobrevive a un repintado y el foco sigue en la nota",
    trasRepintar.valor === texto.slice(0, 20) && trasRepintar.foco, trasRepintar);
  await page.keyboard.type(texto.slice(20));
  await page.keyboard.press("Enter");
  await esperar(500);
  const guardada = await page.evaluate(clave => {
    const tr = document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + CSS.escape(clave) + '"]');
    const sig = tr.nextElementSibling;
    const n = sig && sig.querySelector(".tx-notap");
    const b = tr.querySelector('button[data-accion="nota"]');
    return { bloque: (state.cache.notas_personales || {})[clave], linea: n ? n.textContent : null,
             cursiva: n ? getComputedStyle(n).fontStyle : null, editor: !!document.querySelector("#txCuerpo textarea.tx-nota-texto"),
             foco: document.activeElement === b, resaltado: b.classList.contains("tx-con-nota"), sinLinea: getComputedStyle(tr.children[0]).borderBottomWidth,
             enOperacion: !!tr.querySelector(".tx-notap"), escrituras: window.__writes.length };
  }, clave);
  assert(pref + "T7 -> Intro guarda: en notas_personales, una escritura, en cursiva en la fila de debajo y el foco vuelve al ✏️",
    guardada.bloque && guardada.bloque.texto === texto && guardada.linea === "📝 " + texto && guardada.cursiva === "italic" &&
    !guardada.editor && guardada.foco && guardada.resaltado && guardada.escrituras === escriturasAntes + 1, guardada);
  assert(pref + "T7 -> la nota ya no va bajo la operación y su fila no lleva línea entre ella y la nota",
    !guardada.enOperacion && guardada.sinLinea === "0px", guardada);
  const anchosNota = await anchos();
  assert(pref + "T7 -> ni el editor ni una nota larga cambian el ancho de las columnas",
    JSON.stringify(anchosEditor) === JSON.stringify(anchosAntes) && JSON.stringify(anchosNota) === JSON.stringify(anchosAntes),
    { anchosAntes, anchosEditor, anchosNota });
  await page.evaluate(clave => document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + CSS.escape(clave) + '"]').scrollIntoView({ block: "center" }), clave);
  await page.screenshot({ path: opts.capNota });
  /* Esc cancela sin escribir. */
  await page.click(lapiz);
  await esperar(200);
  const valor = await page.evaluate(() => document.querySelector("#txCuerpo textarea.tx-nota-texto").value);
  await page.keyboard.type(" (cambio)");
  await page.keyboard.press("Escape");
  await esperar(250);
  const trasEsc = await page.evaluate(clave => ({
    editor: !!document.querySelector("#txCuerpo textarea.tx-nota-texto"), t: state.cache.notas_personales[clave].texto,
    w: window.__writes.length, foco: document.activeElement && document.activeElement.getAttribute("data-accion"),
  }), clave);
  assert(pref + "T7 -> al reabrirla trae la nota; Esc cierra sin guardar y el foco vuelve al ✏️",
    valor === texto && !trasEsc.editor && trasEsc.t === texto && trasEsc.w === escriturasAntes + 1 && trasEsc.foco === "nota", trasEsc);
  /* Solo un editor a la vez; otra pulsación del ✏️ lo cierra. */
  const otra = await page.evaluate(clave => {
    const tr = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") !== clave);
    return tr.getAttribute("data-clave");
  }, clave);
  await page.click(lapiz);
  await esperar(150);
  await page.evaluate(otra => document.querySelector('#txCuerpo button[data-accion="nota"][data-clave="' + CSS.escape(otra) + '"]').click(), otra);
  await esperar(200);
  const uno = await page.evaluate(() => [...document.querySelectorAll("#txCuerpo textarea.tx-nota-texto")].map(t => t.getAttribute("data-clave")));
  await page.evaluate(otra => document.querySelector('#txCuerpo button[data-accion="nota"][data-clave="' + CSS.escape(otra) + '"]').click(), otra);
  await esperar(200);
  const ninguno = await page.evaluate(() => document.querySelectorAll("#txCuerpo textarea.tx-nota-texto").length);
  assert(pref + "T7 -> solo un editor a la vez, y el ✏️ de esa fila lo vuelve a cerrar",
    uno.length === 1 && uno[0] === otra && ninguno === 0, { uno, ninguno });
  /* Borrar. */
  await page.click(lapiz);
  await esperar(200);
  await page.click('#txCuerpo [data-accion="nota-borrar"]');
  await esperar(400);
  const borrada = await page.evaluate(clave => ({
    hay: clave in (state.cache.notas_personales || {}),
    fila: !!document.querySelector('#txCuerpo tr.tx-fila-nota[data-clave="' + CSS.escape(clave) + '"]'),
    w: window.__writes.length,
  }), clave);
  assert(pref + "T7 -> «✕ Borrar» la quita (fila incluida): 2 escrituras en total",
    !borrada.hay && !borrada.fila && borrada.w === escriturasAntes + 2, borrada);

  /* ============ T8) nada más cambia ============ */
  assert(pref + "T8 -> misma huella de registros (la clasificación no cambia)", (await huella()) === huellaAntes);
  const soloNotas = await page.evaluate(antes => window.__writes.every(w => {
    const c = JSON.parse(w); delete c.notas_personales; return window.__canon(c) === antes;
  }), cacheAntes);
  assert(pref + "T8 -> cada escritura de la cache solo cambia notas_personales", soloNotas);
};
