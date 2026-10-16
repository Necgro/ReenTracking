/* Comprobaciones de 🚫 «Mandar al spam» y ↩ «Quitar del
 * spam» en 📒 Transacciones, comunes al arnés sintético (verifyapartar1.js)
 * y al de tus datos (verifyapartar1_real.js). Pulsan los iconos de verdad,
 * como el usuario, sobre una página con la clasificación ya hecha.
 *
 *  A1) a 1366 px la tabla cabe sin scroll y ✏️ 🔍 🚫 van en una línea.
 *  A2) 🚫 en un depósito: sale de la lista, «Ver spam» sube en 1, se guarda
 *      un ajuste con su marca y en el spam sale con su motivo y su ↩.
 *  A3) ↩ lo devuelve: la clasificación y los ajustes, exactamente los de antes.
 *  A4) ↩ en un spam de la app: queda «a revisar» (el botón «A revisar» sube
 *      en 1), con la marca ↩ «Sacado del spam», sin 🔍 y con 🚫 «Devolver».
 *  A5) 🚫 lo devuelve: exactamente lo de antes.
 *  A6) en el spam no hay 🔍, y cada cambio se guarda una vez.
 *  A7) lo tuyo lleva la marca 🚫 y su motivo se pulsa para verlo solo.
 *  A8) el menú «📒 Transacciones» sale del spam a la vista normal.
 *
 * Devuelve las claves usadas, para las capturas.
 */
"use strict";
const esperar = ms => new Promise(s => setTimeout(s, ms));

module.exports = async function comprobarApartar1(page, assert, opts = {}) {
  const huella = () => page.evaluate(() => JSON.stringify(state.registros.map(r =>
    [r.clave, r.categoria, r.subcategoria, r.revisar, r.cantidad, r.importe_usdt, r.nota])));
  const ajustes = () => page.evaluate(() => JSON.stringify(state.cache.ajustes_usuario || {}));
  const escrituras = () => page.evaluate(() => window.__writes.length);
  const verSpam = () => page.evaluate(() => {
    const m = /Ver spam \((\d+)\)/.exec(document.getElementById("txRecuento").textContent);
    return m ? Number(m[1]) : null;
  });
  const aRevisar = () => page.evaluate(() => Number(document.querySelector('#txTriaje [data-grupo="revisar"] b').textContent));
  const ultimoAviso = () => page.evaluate(() => { const t = [...document.querySelectorAll("#toasts .toast")].pop(); return t ? t.textContent : ""; });
  const fila = clave => page.evaluate(c => {
    const f = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") === c);
    if (!f) return null;
    return {
      acciones: [...f.querySelectorAll("button[data-accion]")].map(b => b.getAttribute("data-accion")),
      burbujas: [...f.querySelectorAll(".tx-acciones .tx-burbuja b")].map(b => b.textContent),
      marca: (f.querySelector(".tx-marca-sacado") || {}).textContent || "",
      categoria: f.querySelector(".tx-cat").textContent,
    };
  }, clave);
  const pulsar = async (clave, accion) => {
    const sel = '#txCuerpo tr.tx-fila[data-clave="' + clave + '"] button[data-accion="' + accion + '"]';
    /* Los avisos de antes (abajo a la derecha) taparían el botón. */
    await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
    await page.click(sel);
    /* Si hay más de una opción, 🚫 las abre debajo de la fila: aquí se
       prueba «Este movimiento». */
    const este = '#txCuerpo tr.tx-fila-apartar[data-clave="' + clave + '"] button[data-accion="spam-movimiento"]';
    if (accion === "mandar-spam" && await page.$(este)) await page.click(este);
    await esperar(opts.espera || 700);
  };
  const modoSpam = async entrar => {
    await page.evaluate(e => {
      const b = document.querySelector(e ? "#txRecuento [data-ver-spam]" : "#txRecuento [data-salir-spam]");
      if (b) b.click();
    }, entrar);
    await esperar(opts.espera ? opts.espera / 2 : 200);
  };

  /* ============ A1) cabe ============ */
  const medida = await page.evaluate(() => {
    const w = document.querySelector(".tx-tablawrap");
    const f = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.querySelector('[data-accion="mandar-spam"]') &&
      x.querySelector('[data-accion="mandar-revisar"]'));
    const tops = f ? [...f.querySelectorAll(".tx-acciones button")].map(b => Math.round(b.getBoundingClientRect().top)) : [];
    return { scroll: w.scrollWidth - w.clientWidth, iconos: tops.length, lineas: new Set(tops).size };
  });
  assert("A1 -> a 1366 px la tabla cabe sin scroll horizontal", medida.scroll <= 0, medida);
  assert("A1 -> ✏️ 🔍 🚫 en una sola línea", medida.iconos === 3 && medida.lineas === 1, medida);

  /* ============ A2) mandar al spam ============ */
  const claveMandar = await page.evaluate(() => {
    const f = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x =>
      x.classList.contains("tx-c-DEPOSITO") && x.querySelector('[data-accion="mandar-spam"]'));
    return f ? f.getAttribute("data-clave") : null;
  });
  assert("A2 -> hay un depósito con 🚫", !!claveMandar);
  const h0 = await huella(), aj0 = await ajustes(), w0 = await escrituras(), spam0 = await verSpam();
  const f0 = await fila(claveMandar);
  assert("A2 -> su burbuja dice «Mandar al spam»", f0 && f0.burbujas.includes("Mandar al spam"), f0);
  await pulsar(claveMandar, "mandar-spam");
  assert("A2 -> sale de la lista", (await fila(claveMandar)) === null);
  assert("A2 -> «Ver spam» sube en 1", (await verSpam()) === spam0 + 1, [spam0, await verSpam()]);
  assert("A2 -> aviso «Mandado al spam.»", (await ultimoAviso()).startsWith("Mandado al spam."), await ultimoAviso());
  const aj = await page.evaluate(c => (state.cache.ajustes_usuario || {})[c.toLowerCase()], claveMandar);
  assert("A2 -> ajuste guardado con su marca",
    aj && aj.categoria === "SPAM" && aj.revisar === false && /^Mandado al spam por ti \(\d{4}-\d\d-\d\d\)$/.test(aj.nota), aj);
  assert("A2 -> se guarda una vez", (await escrituras()) === w0 + 1);
  await modoSpam(true);
  const enSpam = await fila(claveMandar);
  assert("A2 -> en el spam, con ↩ «Quitar del spam» y sin 🔍",
    enSpam && enSpam.acciones.includes("quitar-ajuste-spam") && !enSpam.acciones.includes("mandar-revisar") &&
    enSpam.burbujas.includes("Quitar del spam"), enSpam);
  const motivo = await page.evaluate(() => [...document.querySelectorAll("#txMotivosSpam li")].map(l => l.textContent));
  assert("A2 -> motivo «1 Marcado como spam»", motivo.includes("1 Marcado como spam"), motivo);
  /* La marca 🚫 en su fila y el motivo que se pulsa. */
  const marcaSpam = await page.evaluate(c => {
    const m = document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + c + '"] .tx-marca-spam');
    return m ? m.textContent : "";
  }, claveMandar);
  assert("A7 -> lo tuyo lleva la marca 🚫 «Marcado como spam»", marcaSpam === "🚫Marcado como spam", marcaSpam);
  const nMarcas = await page.evaluate(() => document.querySelectorAll("#txCuerpo .tx-marca-spam").length);
  assert("A7 -> solo esa fila del spam la lleva (más las que ya llevaban tu marca: " + (opts.marcasPrevias || 0) + ")",
    nMarcas === 1 + (opts.marcasPrevias || 0), nMarcas);
  await page.click('#txMotivosSpam button[data-motivo="ajuste"]');
  await esperar(opts.espera || 300);
  const filtrado = await page.evaluate(() => ({
    filas: [...document.querySelectorAll("#txCuerpo tr.tx-fila")].map(f => f.getAttribute("data-clave")),
    recuento: document.getElementById("txRecuento").textContent,
    pulsado: document.querySelector('#txMotivosSpam button[data-motivo="ajuste"]').getAttribute("aria-pressed"),
    lineas: document.querySelectorAll("#txMotivosSpam li").length,
  }));
  assert("A7 -> al pulsar «Marcado como spam», la tabla enseña solo ese",
    filtrado.filas.length === 1 && filtrado.filas[0] === claveMandar && filtrado.pulsado === "true", filtrado);
  const opSpam = await page.evaluate(() => document.querySelector('#txFiltroCategoria option[value="SPAM"]').textContent);
  assert("A7 -> el selector sigue contando todo el spam", opSpam === "SPAM (" + (spam0 + 1) + ")", opSpam);
  assert("A7 -> el recuento dice «1 de … movimientos de spam» y siguen todos los motivos",
    /^1 de \d+ movimientos de spam/.test(filtrado.recuento) && filtrado.lineas === motivo.length, filtrado);
  if (opts.capSpam) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: opts.capSpam });
  }
  await page.click('#txMotivosSpam button[data-motivo="ajuste"]');
  await esperar(opts.espera || 300);
  const todas = await page.evaluate(() => document.querySelectorAll("#txCuerpo tr.tx-fila").length);
  assert("A7 -> otra pulsación vuelve a enseñar todo el spam", todas === spam0 + 1, [todas, spam0 + 1]);
  /* El menú «📒 Transacciones» vuelve a la vista normal… */
  await page.click('a[href="#transacciones"]');
  await esperar(opts.espera || 300);
  const normal = await page.evaluate(() => ({ cat: document.getElementById("txFiltroCategoria").value,
    verSpam: !!document.querySelector("#txRecuento [data-ver-spam]") }));
  assert("A8 -> el menú «Transacciones» sale del spam a la vista normal", normal.cat === "" && normal.verSpam, normal);
  await modoSpam(true);

  /* ============ A3) quitarlo del spam ============ */
  await pulsar(claveMandar, "quitar-ajuste-spam");
  assert("A3 -> aviso «Quitado del spam.»", (await ultimoAviso()).startsWith("Quitado del spam."), await ultimoAviso());
  assert("A3 -> la clasificación, exactamente la de antes", (await huella()) === h0);
  assert("A3 -> los ajustes, exactamente los de antes", (await ajustes()) === aj0);

  /* ============ A4) sacar del spam uno de la app ============ */
  const claveSacar = await page.evaluate(() => {
    const f = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.querySelector('[data-accion="sacar-spam"]'));
    return f ? f.getAttribute("data-clave") : null;
  });
  assert("A4 -> hay un spam de la app con ↩", !!claveSacar);
  const spamAntes = await page.evaluate(() => [...document.querySelectorAll("#txCuerpo tr.tx-fila")].every(x =>
    !x.querySelector('[data-accion="mandar-revisar"]')));
  assert("A6 -> en el spam no hay 🔍 en ninguna fila", spamAntes);
  const w1 = await escrituras();
  await pulsar(claveSacar, "sacar-spam");
  assert("A4 -> aviso «Sacado del spam. Está en A revisar.»", (await ultimoAviso()).startsWith("Sacado del spam. Está en Revisar."), await ultimoAviso());
  assert("A4 -> sale del spam", (await fila(claveSacar)) === null);
  await modoSpam(false);
  const rev0 = await page.evaluate(() => state.registros.filter(r => r.revisar && r.categoria !== "SPAM").length);
  assert("A4 -> el botón «A revisar» lo cuenta", (await aRevisar()) === rev0 && rev0 >= 1, [await aRevisar(), rev0]);
  await page.evaluate(() => document.querySelector('#txTriaje [data-grupo="revisar"]').click());
  await esperar(opts.espera || 300);
  const sacada = await fila(claveSacar);
  assert("A4 -> con «A revisar» pulsado, sale con la marca ↩, sin 🔍 y con 🚫 «Devolver al spam»",
    sacada && sacada.marca.startsWith("↩") && sacada.marca.includes("Sacado del spam") &&
    !sacada.acciones.includes("mandar-revisar") && sacada.acciones.includes("quitar-ajuste-spam") &&
    sacada.burbujas.includes("Devolver al spam"), sacada);
  const enRevision = await page.evaluate(c => { const r = state.registros.find(x => x.clave === c); return r && r.revisar && r.categoria === "REVISAR"; }, claveSacar);
  assert("A4 -> queda a revisar (sale en 🔍 Revisión)", enRevision);
  if (opts.capSacado) {
    await page.evaluate(c => document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + c + '"]').scrollIntoView({ block: "center" }), claveSacar);
    await page.hover('#txCuerpo tr.tx-fila[data-clave="' + claveSacar + '"] .tx-marca-sacado');
    await esperar(150);
    await page.screenshot({ path: opts.capSacado });
  }

  /* ============ A5) devolverlo al spam ============ */
  await pulsar(claveSacar, "quitar-ajuste-spam");
  assert("A5 -> aviso «Devuelto al spam.»", (await ultimoAviso()).startsWith("Devuelto al spam."), await ultimoAviso());
  assert("A5 -> la clasificación, exactamente la de antes", (await huella()) === h0);
  assert("A5 -> los ajustes, exactamente los de antes", (await ajustes()) === aj0);
  assert("A6 -> cada cambio se guarda una vez (4 cambios, 4 escrituras)", (await escrituras()) === w1 + 2 && w1 === w0 + 2, [w0, w1, await escrituras()]);
  await page.evaluate(() => document.querySelector('#txTriaje [data-grupo="revisar"]').click());
  await esperar(opts.espera || 300);
  return { claveMandar, claveSacar };
};
