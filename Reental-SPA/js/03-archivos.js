/* =====================================================================
   REENTAL SPA · js/03-archivos.js
   Acceso a disco y al navegador.
   Tu archivo vive en el navegador (js/19); aquí quedan descargar, elegir un archivo y el
   diálogo de guardar del Excel.
   ===================================================================== */

const soportaFSA = ("showOpenFilePicker" in window);

/* Un archivo cualquiera (p. ej. el Excel), con el diálogo de guardar.
   tipo: { description, accept: { "tipo/mime": [".ext"] } }. */
async function guardarBlobComo(nombre, blob, tipo) {
  if (!soportaFSA) throw new Error("File System Access API no disponible");
  const handle = await window.showSaveFilePicker({ suggestedName: nombre, types: [tipo] });
  const w = await handle.createWritable();
  await w.write(blob);
  await w.close();
  return handle;
}
function descargarBlob(nombre, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function descargarJson(nombre, obj) {
  descargarBlob(nombre, new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
}
/* Un archivo elegido por ti, en cualquier navegador (sin
   permisos). Devuelve el File, o null si cancelas. */
function elegirArchivo(accept) {
  return new Promise(ok => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => ok(input.files[0] || null));
    input.addEventListener("cancel", () => ok(null));
    input.click();
  });
}

/* IndexedDB de ESTE navegador (nunca sale del equipo): tu archivo (js/05)
   y lo que recuerda js/19. */
const ARR_IDB = { nombre: "reental_spa", almacen: "recordados" };
function idbAbrir() {
  return new Promise((ok, ko) => {
    if (typeof indexedDB === "undefined") { ko(new Error("IndexedDB no disponible")); return; }
    const pet = indexedDB.open(ARR_IDB.nombre, 1);
    pet.onupgradeneeded = () => pet.result.createObjectStore(ARR_IDB.almacen);
    pet.onsuccess = () => ok(pet.result);
    pet.onerror = () => ko(pet.error);
  });
}
async function idbOperar(modo, operacion) {
  const db = await idbAbrir();
  try {
    return await new Promise((ok, ko) => {
      const tx = db.transaction(ARR_IDB.almacen, modo);
      const pet = operacion(tx.objectStore(ARR_IDB.almacen));
      tx.oncomplete = () => ok(pet ? pet.result : undefined);
      tx.onerror = () => ko(tx.error);
      tx.onabort = () => ko(tx.error);
    });
  } finally { db.close(); }
}
