/* Monta la app en un solo archivo: los <script src="js/…"> del index.html,
 * con su código dentro. Para abrirla con doble clic, sin servidor.
 * Uso: node .github/archivo-unico.js <salida.html> */
"use strict";
const fs = require("fs");
const path = require("path");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const salida = process.argv[2];
if (!salida) { console.error("Falta la ruta de salida."); process.exit(1); }

let n = 0;
const html = fs.readFileSync(path.join(SPA, "index.html"), "utf8")
  .replace(/<script src="(js\/[^"]+\.js)"><\/script>/g, (_, ruta) => {
    const codigo = fs.readFileSync(path.join(SPA, ruta), "utf8");
    if (/<\/script/i.test(codigo)) throw new Error(ruta + " lleva «</script»: no se puede meter dentro");
    n++;
    return "<script>/* " + ruta + " */\n" + codigo + "\n</script>";
  });
if (/<script src=/.test(html)) throw new Error("queda un <script src> sin meter dentro");
const enDisco = fs.readdirSync(path.join(SPA, "js")).filter(f => f.endsWith(".js")).length;
if (n !== enDisco) throw new Error(n + " scripts en el index.html y " + enDisco + " en js/");
fs.writeFileSync(salida, html);
console.log(salida + ": " + n + " módulos, " + (html.length / 1024).toFixed(0) + " KB");
