/* Comprobaciones de 🚫 con «Este movimiento», «Toda la dirección» y
 * «Todo el token» debajo de la fila, en 📒 Transacciones, comunes al arnés sintético (verifyapartar2.js) y al de tus datos
 * (verifyapartar2_real.js). Pulsan los botones de verdad, como el usuario,
 * sobre una página con la clasificación ya hecha.
 *
 *  B1) 🚫 en un depósito de una dirección desconocida abre las opciones
 *      debajo de la fila (sin escribir nada); Esc y «Cancelar» las cierran;
 *      con ellas abiertas, la tabla cabe sin scroll.
 *  B2) «Toda la dirección»: todo lo que llega de ella sale de la lista, con
 *      su aviso y el número; se guarda el bloque spam_usuario una vez y los
 *      ajustes no cambian.
 *  B3) en el spam: su motivo, la marca 🚫 y ↩ «Quitar del spam» con «Toda
 *      la dirección.».
 *  B4) ↩ lo deshace: la clasificación, los ajustes y la cache, exactamente
 *      los de antes (sin bloque).
 *  B5) (si opts.token) lo mismo con «Todo el token»: entradas y salidas.
 *
 * Devuelve lo usado, para las capturas.
 */
"use strict";
const esperar = ms => new Promise(s => setTimeout(s, ms));

module.exports = async function comprobarApartar2(page, assert, opts = {}) {
  const espera = opts.espera || 700;
  const huella = () => page.evaluate(() => JSON.stringify(state.registros.map(r =>
    [r.clave, r.categoria, r.subcategoria, r.revisar, r.cantidad, r.importe_usdt, r.nota])));
  const cacheSinTx = () => page.evaluate(() => JSON.stringify(Object.assign({}, state.cache, { transacciones: null })));
  const escrituras = () => page.evaluate(() => window.__writes.length);
  const ultimoAviso = () => page.evaluate(() => { const t = [...document.querySelectorAll("#toasts .toast")].pop(); return t ? t.textContent : ""; });
  const sinAvisos = () => page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
  const menu = clave => page.evaluate(c => {
    const f = [...document.querySelectorAll("#txCuerpo tr.tx-fila-apartar")].find(x => x.getAttribute("data-clave") === c);
    if (!f) return null;
    const anterior = f.previousElementSibling;
    return {
      debajo: !!anterior && anterior.getAttribute("data-clave") === c && anterior.classList.contains("tx-fila"),
      botones: [...f.querySelectorAll("button[data-accion]")].map(b => b.getAttribute("data-accion") + ":" + b.textContent),
      expandido: (document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + c + '"] button[data-accion="mandar-spam"]') || {})
        .getAttribute?.("aria-expanded"),
    };
  }, clave);
  const clic = async (clave, accion, fila) => {
    await sinAvisos();
    await page.click('#txCuerpo tr.' + (fila || "tx-fila") + '[data-clave="' + clave + '"] button[data-accion="' + accion + '"]');
    await esperar(espera);
  };
  const modoSpam = async entrar => {
    await page.evaluate(e => {
      const b = document.querySelector(e ? "#txRecuento [data-ver-spam]" : "#txRecuento [data-salir-spam]");
      if (b) b.click();
    }, entrar);
    await esperar(espera / 2);
  };
  const visibles = () => page.evaluate(() => [...document.querySelectorAll("#txCuerpo tr.tx-fila")].map(f => f.getAttribute("data-clave")));

  /* Un depósito con 🚫 cuyas opciones traen «Toda la dirección» (y, si se
     pide, «Todo el token»). */
  const buscarFila = token => page.evaluate(t => {
    const ctx = construirContexto(state.cache);
    const f = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => {
      if (!x.querySelector('[data-accion="mandar-spam"]')) return false;
      const r = state.registros.find(y => y.clave === x.getAttribute("data-clave"));
      const o = txOpcionesApartar(r, ctx);
      return t ? !!o.token : !!o.direccion && !o.token;
    });
    return f ? f.getAttribute("data-clave") : null;
  }, token);

  /* ============ B1) las opciones, debajo ============ */
  const clave = await buscarFila(false);
  assert("B1 -> hay un depósito de una dirección desconocida con 🚫", !!clave);
  const h0 = await huella(), c0 = await cacheSinTx(), w0 = await escrituras();
  await clic(clave, "mandar-spam");
  const m1 = await menu(clave);
  assert("B1 -> 🚫 abre las opciones justo debajo de su fila",
    m1 && m1.debajo && m1.expandido === "true", m1);
  assert("B1 -> «Este movimiento», «Toda la dirección 0x…» y «Cancelar»",
    m1 && m1.botones.length === 3 && m1.botones[0] === "spam-movimiento:Este movimiento" &&
    /^spam-direccion:Toda la dirección 0x[0-9a-f]{5}…[0-9a-f]{5}$/.test(m1.botones[1]) && m1.botones[2] === "spam-cancelar:Cancelar", m1);
  const foco = await page.evaluate(() => (document.activeElement || {}).getAttribute?.("data-accion"));
  assert("B1 -> el foco va a «Este movimiento»", foco === "spam-movimiento", foco);
  const ancho = await page.evaluate(() => { const w = document.querySelector(".tx-tablawrap"); return w.scrollWidth - w.clientWidth; });
  assert("B1 -> con las opciones abiertas, la tabla cabe sin scroll", ancho <= 0, ancho);
  if (opts.capMenu) await page.screenshot({ path: opts.capMenu });
  await page.keyboard.press("Escape");
  await esperar(200);
  assert("B1 -> Esc las cierra", (await menu(clave)) === null);
  await clic(clave, "mandar-spam");
  await clic(clave, "spam-cancelar", "tx-fila-apartar");
  assert("B1 -> «Cancelar» las cierra", (await menu(clave)) === null);
  await clic(clave, "mandar-spam");
  await clic(clave, "mandar-spam");
  assert("B1 -> otra pulsación de 🚫 las cierra", (await menu(clave)) === null);
  /* Si su fila deja de verse, se cierran y no vuelven a salir solas. */
  await clic(clave, "mandar-spam");
  await modoSpam(true);
  await modoSpam(false);
  assert("B1 -> al salir y volver a la vista, las opciones no reaparecen solas", (await menu(clave)) === null);
  assert("B1 -> abrir y cerrar no escribe nada ni cambia nada",
    (await escrituras()) === w0 && (await huella()) === h0 && (await cacheSinTx()) === c0);

  /* Sin el archivo de Reental no se guarda la regla (si no, el aviso
     diría «0 movimientos»). */
  const spam0 = await page.evaluate(() => JSON.stringify(state.cache.spam_usuario)); // tus datos pueden traer ya uno
  await page.evaluate(() => { state.csvCargado = false; });
  await clic(clave, "mandar-spam");
  await clic(clave, "spam-direccion", "tx-fila-apartar");
  const sinCsv = await ultimoAviso();
  assert("B1 -> sin el archivo de Reental, no guarda nada y dice qué falta",
    sinCsv.startsWith("Falta el archivo de rendimientos") && (await escrituras()) === w0 &&
    (await page.evaluate(() => JSON.stringify(state.cache.spam_usuario))) === spam0 && (await menu(clave)) === null, sinCsv);
  await page.evaluate(() => { state.csvCargado = true; });

  /* ============ B2) «Toda la dirección» ============ */
  const dir = await page.evaluate(c => normalizarDireccion(state.registros.find(r => r.clave === c).origen), clave);
  const deEsaDireccion = await page.evaluate(d => state.registros.filter(r => r.categoria !== "SPAM" &&
    normalizarDireccion(r.origen || "") === d).map(r => r.clave), dir);
  const ajustes0 = await page.evaluate(() => JSON.stringify(state.cache.ajustes_usuario || {}));
  await clic(clave, "mandar-spam");
  await clic(clave, "spam-direccion", "tx-fila-apartar");
  const n = deEsaDireccion.length;
  const aviso = await ultimoAviso();
  assert("B2 -> aviso «Dirección mandada al spam: " + n + " movimiento(s).»",
    aviso.startsWith("Dirección mandada al spam: " + n + (n === 1 ? " movimiento." : " movimientos.")), aviso);
  const quedan = await visibles();
  assert("B2 -> todo lo que llega de ella sale de la lista", deEsaDireccion.every(c => !quedan.includes(c)), deEsaDireccion);
  const bloque = await page.evaluate(() => state.cache.spam_usuario);
  const previo = spam0 ? JSON.parse(spam0) : {};
  assert("B2 -> se guarda en su bloque, con la fecha (lo que ya hubiera, igual)",
    bloque && Object.keys(bloque.direcciones || {}).join() === dir &&
    /^\d{4}-\d\d-\d\d$/.test(bloque.direcciones[dir].fecha) &&
    JSON.stringify(bloque.tokens || {}) === JSON.stringify(previo.tokens || {}), bloque);
  assert("B2 -> los ajustes no cambian", (await page.evaluate(() => JSON.stringify(state.cache.ajustes_usuario || {}))) === ajustes0);
  assert("B2 -> se guarda una vez", (await escrituras()) === w0 + 1);

  /* ============ B3) en el spam ============ */
  await modoSpam(true);
  const motivos = await page.evaluate(() => [...document.querySelectorAll("#txMotivosSpam li")].map(l => l.textContent));
  assert("B3 -> motivo «" + n + " Dirección marcada como spam»", motivos.includes(n + " Dirección marcada como spam"), motivos);
  const enSpam = await page.evaluate(c => {
    const f = document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + c + '"]');
    if (!f) return null;
    return {
      marca: (f.querySelector(".tx-marca-spam") || {}).textContent || "",
      acciones: [...f.querySelectorAll("button[data-accion]")].map(b => b.getAttribute("data-accion")),
      burbujas: [...f.querySelectorAll(".tx-acciones .tx-burbuja")].map(b => b.textContent),
    };
  }, clave);
  assert("B3 -> su fila lleva la marca 🚫 «Dirección marcada como spam»",
    enSpam && enSpam.marca === "🚫Dirección marcada como spam", enSpam);
  assert("B3 -> y ↩ «Quitar del spam» con «Toda la dirección.», sin 🔍",
    enSpam && enSpam.acciones.includes("quitar-regla-spam") && !enSpam.acciones.includes("mandar-revisar") &&
    enSpam.burbujas.includes("Quitar del spam Toda la dirección."), enSpam);
  if (opts.capSpam) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: opts.capSpam });
  }

  /* ============ B4) deshacer ============ */
  await clic(clave, "quitar-regla-spam");
  const aviso4 = await ultimoAviso();
  assert("B4 -> aviso «Dirección quitada del spam: " + n + " …»", aviso4.startsWith("Dirección quitada del spam: " + n), aviso4);
  assert("B4 -> la clasificación, exactamente la de antes", (await huella()) === h0);
  assert("B4 -> la cache, exactamente la de antes (y su bloque, el de antes o ninguno)", (await cacheSinTx()) === c0 &&
    (await page.evaluate(() => JSON.stringify(state.cache.spam_usuario))) === spam0);
  assert("B4 -> 2 cambios, 2 escrituras", (await escrituras()) === w0 + 2);
  await modoSpam(false);

  /* ============ B6) tu ajuste y la regla a la vez ============ */
  if (n >= 2) {
    const [uno, otro] = deEsaDireccion;
    await clic(uno, "mandar-spam");
    await clic(uno, "spam-movimiento", "tx-fila-apartar");
    await clic(otro, "mandar-spam");
    await clic(otro, "spam-direccion", "tx-fila-apartar");
    await modoSpam(true);
    await clic(uno, "quitar-ajuste-spam");
    const aviso6 = await ultimoAviso();
    assert("B6 -> quitar tu ajuste avisa de que sigue en el spam por su dirección",
      aviso6.startsWith("Quitado tu ajuste: sigue en el spam por su dirección."), aviso6);
    assert("B6 -> y sigue en el spam, ahora con el ↩ de la dirección",
      (await visibles()).includes(uno) &&
      (await page.evaluate(c => !!document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + c + '"] [data-accion="quitar-regla-spam"]'), uno)));
    await clic(uno, "quitar-regla-spam");
    assert("B6 -> quitar la dirección lo deja todo como antes", (await huella()) === h0 && (await cacheSinTx()) === c0);
    await modoSpam(false);
  }

  /* ============ B5) «Todo el token» ============ */
  if (opts.token) {
    const claveTok = await buscarFila(true);
    assert("B5 -> hay un movimiento de un token desconocido con 🚫", !!claveTok);
    const contrato = await page.evaluate(c => state.registros.find(r => r.clave === c).contrato, claveTok);
    const delToken = await page.evaluate(k => state.registros.filter(r => r.contrato === k && r.categoria !== "SPAM").map(r => r.clave), contrato);
    await clic(claveTok, "mandar-spam");
    const mt = await menu(claveTok);
    assert("B5 -> sus opciones traen «Todo el token USDT.e»", mt && mt.botones.includes("spam-token:Todo el token USDT.e"), mt);
    await clic(claveTok, "spam-token", "tx-fila-apartar");
    const avisoT = await ultimoAviso();
    assert("B5 -> aviso «Token mandado al spam: " + delToken.length + " movimientos.»",
      avisoT.startsWith("Token mandado al spam: " + delToken.length + " movimientos."), avisoT);
    const regs = await page.evaluate(k => state.registros.filter(r => r.contrato === k).map(r => r.categoria), contrato);
    assert("B5 -> entradas y salidas del token, en el spam", delToken.length >= 2 && regs.every(c => c === "SPAM"), regs);
    await modoSpam(true);
    await clic(claveTok, "quitar-regla-spam");
    assert("B5 -> ↩ lo deshace: la clasificación y la cache, exactamente las de antes",
      (await huella()) === h0 && (await cacheSinTx()) === c0);
    await modoSpam(false);
  }
  return { clave, direccion: dir, movimientos: n };
};
