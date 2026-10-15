# Cambios

Lo más reciente, arriba. Una fila por versión o paso.

## 1.2 — compras pagadas en dólares (15/10/2026)

- **💶 Coste de las compras:** una compra por transferencia guardada con «En
  USDT…» (pagada en dólares) se ve en $, con sus € al lado; al editarla,
  «En USDT…» viene con lo que pusiste.
- **📊 Dashboard:** esas compras cuentan en la parte en $ del dinero invertido.
- **Cálculo:** no cambia; el coste de compra sigue en € (con el BCE del día del
  pago).
- **Pruebas:** dos casos completos con datos inventados (una preventa de RNT
  entregada poco a poco y un reparto de inmuebles pagado en dólares).

## 1.1 — lo que salió de las primeras pruebas (15/10/2026)

- **🚀 Puesta en marcha:** la primera descarga empieza sola al poner la
  wallet y la API key; si falta el vault, la app propone el que creó tu
  wallet (también con «🔍 Buscar mi vault», junto a su campo).
- **🔍 Revisión:**
  - Un índice fijo arriba para saltar a cada bloque, en el orden en que
    conviene resolverlos.
  - «ⓘ Qué es cada cosa» y una explicación al pasar el ratón por cada botón.
  - «🏠 Es un inmueble» en la tarjeta de un token con dudas; «Descartar» del
    catálogo manda todo el token al spam (se deshace en 📒).
  - El RNT que te llega: «Regalo (airdrop)», «Recompensa DeFi» o «Compra
    bancaria…» (RNT pagado en €, p. ej. una preventa entregada poco a poco),
    con «¿también los otros?» para lo llegado desde esa dirección.
  - 💶 Coste: «En USDT…» para una compra pagada en USDT a Reental y
    entregada después (lo pagado en € con el BCE del día del pago).
  - Catálogo: interruptor «Ver todos»; apagado, solo los inmuebles que
    tienes.
- **📒 Transacciones:** el canje de un contrato se llama así (no venta y
  compra); «Movimiento neutro», el mismo nombre que en 🔍.
- **📊 Dashboard:** debajo del dinero invertido, lo comprado en € y en $.
- **Cálculo:** la compra de RNT pagada en € entra en la cola del RNT (una
  venta posterior encuentra su coste); un premio que dejas como «Recompensa
  DeFi» se queda como tal.
- **Importes escritos:** el punto solo separa miles («1.500»); «1500.25»
  pide la coma.

## 1.0 — primera versión pública (10/10/2026)

- La app completa: descarga de Etherscan, BCE y CoinGecko; archivo de
  rendimientos de Reental; clasificación y 🔍 Revisión; 📒 Transacciones,
  📊 Dashboard, 💰 Rendimientos, 🧾 Fiscal, 📤 Exportar (Excel, informe para la
  Renta en PDF e impresión) y 📖 Ayuda; cuadre con la blockchain.
- Todo se guarda en el navegador, con copia de seguridad.
- En la web y como archivo único para descargar (`ReenTrack.zip`), los dos
  puestos al día solos con cada cambio.
- Pruebas puras, paridades con cifras de referencia (datos inventados) y
  arneses de navegador; las que usan datos reales leen `privado/datos_reales/`.
