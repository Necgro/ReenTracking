/* Lo precarga regresion.js en los arneses (NODE_OPTIONS=--require).
 *
 * Cuando dos Chrome se cierran casi a la vez tras un rato abiertos, los dos
 * tardan ~120 s en salir (es de Chrome, no de la app; con un arnés solo no
 * pasa). En la regresión van 4 a la vez y pasaba a menudo: ~4 min de más.
 * Aquí, si Chrome no ha salido 5 s después de browser.close(), se mata: el
 * perfil es temporal y el arnés termina justo después.
 */
"use strict";
const { CdpBrowser } = require("puppeteer-core");
const cerrar = CdpBrowser.prototype.close;
CdpBrowser.prototype.close = function () {
  return Promise.race([
    cerrar.call(this),
    new Promise(fin => setTimeout(() => { try { this.process().kill(); } catch (e) { /* ya salió */ } fin(); }, 5000).unref()),
  ]);
};
