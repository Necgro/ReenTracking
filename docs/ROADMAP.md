# Hoja de ruta

> Estado y siguiente paso (un solo sitio). Lo hecho, versión a versión, en el
> [CHANGELOG](CHANGELOG.md). Las palabras, según el
> [glosario](especificaciones/glosario.md).

## Hecho

- **Datos:** descarga de Etherscan (solo lo nuevo desde el último bloque), tipos
  del BCE, precios de CoinGecko y el archivo de rendimientos de Reental.
- **Clasificación** de cada movimiento (compras, ventas, rendimientos, DeFi del
  RNT, spam…) y 🔍 Revisión para lo que no se puede decidir solo: vínculos
  venta↔cobro, inmuebles, precios que faltan, direcciones y el coste de las
  compras por transferencia bancaria.
- **Pestañas:** 🚀 Puesta en marcha, 🔍 Revisión, 📒 Transacciones, 📊 Dashboard,
  💰 Rendimientos, 🧾 Fiscal, 📤 Exportar y 📖 Ayuda.
- **Motor fiscal** (FIFO, retenciones, base del ahorro), informe para la Renta,
  Excel y PDF, y el cuadre con la blockchain.
- **Guardado** en el navegador (IndexedDB), con copia de seguridad y aviso si la
  app está abierta en otra pestaña; igual abierta con doble clic como archivo
  único (comprobado en Chrome, Edge y Firefox).
- **Comprobación antes de cada commit** de que nada de `privado/` va a Git.
- **Pruebas:** puras, paridades con cifras de referencia y arneses de navegador.

## Siguiente

| Paso | Qué |
|---|---|
| ➡️ **Publicar** | Repo público y la app en GitHub Pages, con el archivo único para descargar (`ReenTrack.html`, en `.zip`), montados solos con cada cambio (`.github/`) |

## Solo si hace falta

- **Volver a leer todo el histórico:** una casilla para pedir a Etherscan todo
  otra vez. Solo si aparece un descuadre que no se explique (hoy una descarga a
  medias no avanza el último bloque, cambiar la wallet o el vault ya lo pide
  todo y el cuadre avisaría de un hueco).

## Descartado

- **Modo automático** (descargas programadas en GitHub Actions): solo ahorra
  pulsar «🔄 Actualizar» y el archivo de Reental se baja a mano igual.
- **Historial de importaciones:** el aviso al cargar el archivo de Reental ya
  dice cuántos repartos son nuevos.
- **Ejecutable (.exe):** pesado y con avisos del antivirus sin firma de pago.
- **Lo DeFi ajeno** a Reental, **consejos fiscales** y **versión para móvil**
  (ver «Reglas que no se tocan» en el [README](../README.md)).
