/* Comprobaciones de la tabla y los filtros de fecha de 📒 Transacciones, comunes a verifytx1h.js
 * (datos sintéticos) y verifytx1h_real.js (tus datos, solo en memoria).
 *
 * Con la página ya en #transacciones, clasificada y con escribirArchivoNavegador
 * capturado en window.__writes, comprueba:
 *  H1) sin la franja de color de la fila (ni en la fila ni en su nota).
 *  H2) más separación entre «Categoría» y «Token» (≥ 22 px)
 *      y, con el menú plegado, el sitio libre repartido entre todas las
 *      columnas (no solo Token, Operación y Contraparte), sin
 *      partir filas en dos.
 *  H3) «Desde» y «Hasta» (calendarios), en su propia línea bajo los demás
 *      filtros y dentro de su caja.
 *  H4) entre dos fechas: solo los movimientos de esos días (los dos
 *      incluidos), «X de N movimientos», y cada calendario no deja pasar
 *      del otro.
 *  H5) «✖ Limpiar filtros» los vacía y vuelve el libro entero.
 *  H6) la tabla sigue cabiendo sin scroll a 1366 px.
 *  H7) nada cambia por dentro: misma huella de registros y 0 escrituras.
 */
"use strict";
const esperar = ms => new Promise(s => setTimeout(s, ms));

module.exports = async function comprobarTx1h(page, assert, opts = {}) {
  const huella = () => page.evaluate(() => JSON.stringify(state.registros));
  const huellaAntes = await huella();
  const escriturasAntes = await page.evaluate(() => window.__writes.length);
  const filas = () => page.evaluate(() => document.querySelectorAll("#txCuerpo tr.tx-fila").length);
  const N = await filas();

  /* ============ H1) sin franja ============ */
  const h1 = await page.evaluate(() => [...document.querySelectorAll("#txCuerpo tr")]
    .map(tr => getComputedStyle(tr.querySelector("td")).boxShadow).filter(b => b !== "none"));
  assert("H1 -> ninguna fila con franja de color (" + N + " filas)", N > 0 && h1.length === 0, h1.slice(0, 3));

  /* ============ H2) separación y sitio libre repartido ============ */
  const hueco = () => page.evaluate(() => Math.min(...[...document.querySelectorAll("#txCuerpo tr.tx-fila")].map(tr =>
    Math.round(tr.querySelector(".tx-token-txt").getBoundingClientRect().left - tr.querySelector(".tx-cat").getBoundingClientRect().right))));
  const aire = () => page.evaluate(() => parseInt(document.getElementById("txTabla").style.getPropertyValue("--tx-aire"), 10) || 0);
  const g0 = await hueco();
  assert("H2 -> entre la etiqueta y el token, al menos 22 px con el menú abierto (" + g0 + " px)", g0 >= 22, g0);
  await page.evaluate(() => txAplicarNavPlegada(true));
  await esperar(300);
  const a1 = await aire(), g1 = await hueco();
  const h2 = await page.evaluate(() => {
    const t = document.getElementById("txTabla"), alto = t.offsetHeight, cajaW = document.querySelector(".tx-tablawrap").clientWidth;
    const a = t.style.getPropertyValue("--tx-aire");
    t.style.setProperty("--tx-aire", "0px"); const alto0 = t.offsetHeight; t.style.setProperty("--tx-aire", a);
    return { alto, alto0, sobra: cajaW - t.offsetWidth };
  });
  assert("H2 -> con el menú plegado, el sitio libre se reparte (" + a1 + " px por columna) y la separación crece (" + g1 + " px)",
    a1 > 0 && g1 >= g0 + a1, { a1, g0, g1 });
  assert("H2 -> repartirlo no parte ninguna fila en dos ni saca scroll", h2.alto === h2.alto0 && h2.sobra >= 0, h2);
  if (opts.capPlegado) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: opts.capPlegado });
  }
  await page.evaluate(() => txAplicarNavPlegada(false));
  await esperar(300);

  /* ============ H3) Desde / Hasta bajo los filtros ============ */
  const h3 = await page.evaluate(() => {
    const desde = document.getElementById("txFiltroDesde"), hasta = document.getElementById("txFiltroHasta");
    const caja = document.getElementById("txFiltros").getBoundingClientRect();
    const sel = document.getElementById("txFiltroCategoria").getBoundingClientRect();
    const d = desde.getBoundingClientRect(), h = hasta.getBoundingClientRect();
    const etiqueta = el => (document.querySelector('label[for="' + el.id + '"]') || {}).textContent;
    return { tipos: desde.type + "/" + hasta.type, etiquetas: etiqueta(desde) + "/" + etiqueta(hasta),
      debajo: d.top >= sel.bottom, mismaLinea: Math.abs(d.top - h.top) < 2 && h.left > d.left,
      dentro: d.bottom <= caja.bottom && d.left >= caja.left, vacios: !desde.value && !hasta.value };
  });
  assert("H3 -> «Desde» y «Hasta» con calendario, vacíos, en una línea bajo los filtros y en su caja",
    h3.tipos === "date/date" && h3.etiquetas === "Desde/Hasta" && h3.debajo && h3.mismaLinea && h3.dentro && h3.vacios, h3);

  /* ============ H4) entre dos fechas ============ */
  /* Días con movimiento en el libro, de lo que se ve: se elige un tramo
     que deje fuera los de los extremos. */
  const dias = await page.evaluate(() => [...new Set([...document.querySelectorAll("#txCuerpo tr.tx-fila td.tx-fecha")]
    .map(td => td.textContent.trim().split("/").reverse().join("-")))].sort());
  const desde = dias[1], hasta = dias[dias.length - 2];
  const poner = (id, v) => page.evaluate((id, v) => {
    const el = document.getElementById(id);
    el.value = v; el.dispatchEvent(new Event("change", { bubbles: true }));
  }, id, v);
  await poner("txFiltroDesde", desde);
  await poner("txFiltroHasta", hasta);
  await esperar(200);
  const h4 = await page.evaluate(() => ({
    dias: [...document.querySelectorAll("#txCuerpo tr.tx-fila td.tx-fecha")].map(td => td.textContent.trim().split("/").reverse().join("-")),
    rec: document.getElementById("txRecuento").textContent,
    min: document.getElementById("txFiltroHasta").min, max: document.getElementById("txFiltroDesde").max,
  }));
  const fuera = h4.dias.filter(d => d < desde || d > hasta);
  assert("H4 -> entre " + desde + " y " + hasta + ": " + h4.dias.length + " de " + N + ", todos en el tramo y los extremos incluidos",
    h4.dias.length > 0 && h4.dias.length < N && fuera.length === 0 && h4.dias.includes(desde) && h4.dias.includes(hasta), { fuera: fuera.slice(0, 3), n: h4.dias.length });
  assert("H4 -> el recuento dice «" + h4.dias.length + " de " + N + " movimientos»",
    h4.rec.startsWith(h4.dias.length.toLocaleString("es-ES") + " de " + N.toLocaleString("es-ES") + " movimientos"), h4.rec);
  assert("H4 -> «Hasta» no deja elegir antes de «Desde» y al revés", h4.min === desde && h4.max === hasta, h4);
  if (opts.capFechas) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: opts.capFechas });
  }

  /* ============ H5) Limpiar ============ */
  await page.click("#txLimpiar");
  await esperar(200);
  const h5 = await page.evaluate(() => ["txFiltroDesde", "txFiltroHasta"].map(id => {
    const el = document.getElementById(id); return el.value + el.min + el.max; }).join(""));
  assert("H5 -> «Limpiar filtros» vacía las fechas y vuelve el libro entero", h5 === "" && await filas() === N, { h5 });

  /* ============ H6) cabe a 1366 px ============ */
  const h6 = await page.evaluate(() => { const w = document.querySelector(".tx-tablawrap"); return w.scrollWidth - w.clientWidth; });
  assert("H6 -> la tabla cabe sin scroll a 1366 px (" + h6 + " px de más)", h6 <= 0, h6);

  /* ============ H7) nada cambia ============ */
  assert("H7 -> misma huella de registros y 0 escrituras",
    await huella() === huellaAntes && await page.evaluate(() => window.__writes.length) === escriturasAntes);
};
