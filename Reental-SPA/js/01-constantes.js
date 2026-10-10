/* =====================================================================
   REENTAL SPA · js/01-constantes.js
   Constantes globales (direcciones, contratos, APIs, filtros de spam)
   y el estado global de la aplicación.
   USDC y USDT llevan 6 decimales; RNT, 18.
   ===================================================================== */

/* ----------------------------- Constantes ----------------------------- */
const USDT  = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
const RNT   = "0x27ab6e82f3458edbc0703db2756391b899ce6324";
const USDC  = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
const BURN  = "0x0000000000000000000000000000000000000000";
const STABLECOINS = new Set([USDT, USDC]);
const DECIMALES = { [USDT]: 6, [USDC]: 6, [RNT]: 18 };
const DECIMALES_DEFECTO = 18;
const PREFIJO_REENTAL = "reental-";
const ROLES_CONTRATOS = ["DISTRIBUIDOR", "SETTLEMENT", "DEFI_POOL", "DEFI_STAKING", "DEFI_FARMING", "DEFI_REWARDS", "INFRAESTRUCTURA"];
const SEMILLAS_DEFI = {
  DEFI_POOL: {
    "0x03e2ca2d684049ea8bfa87e078377980f543b6e3": "Pool RNT/USDT",
    "0x4097073e82edac2d758ecfd594139a891340d59d": "SushiSwap RNT Pool"
  },
  DEFI_STAKING: { "0x0bdf6e4674b408cac2fb00d840c549b4e410cf47": "xRNT Staking" },
  DEFI_FARMING: { "0xcfee52ce10aa7e6a4ba219e56ce60207654815e9": "RNT Farming" },
  DEFI_REWARDS: {
    "0xc2c5e41c46fa871a0f9fa54b47a115033521d92e": "Stacking Reental",
    "0xb20d1ec6ead7aa22a5001401cde522940eeb0f0e": "frmRNT Claim"
  }
};
const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";
const ETHERSCAN_CHAINID = 137;
const ETHERSCAN_MAX_REGISTROS = 10000;
const BCE_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A";
const COINGECKO_HISTORY_URL = "https://api.coingecko.com/api/v3/coins/reental/history";
// Señales de spam.
const RE_URL = /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:\/|\b))/;
const RE_PALABRA_SPAM = /\b(visit|free|claims?|airdrops?|casino|ads|www|https?)\b/;
const CARACTERES_SPAM = "*!#";

/* ----------------------------- Estado global ----------------------------- */
const state = {
  config: {},
  cache: null,
  cacheDirty: false,    // cambios que aún no están guardados en el navegador
  errorGuardar: false,  // el último guardado en el navegador falló (lleno o bloqueado)
  datos: null,          // reental_datos.json (solo lectura)
  filasCsv: [],         // CSV parseado (no se cachea)
  indicePorHash: {},
  csvCargado: false,
  sync: { running: false }
};