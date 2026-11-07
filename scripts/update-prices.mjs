// Actualiza prices.json con el valor liquidativo de cada fondo (Financial Times, por ISIN), el precio de los ETF/ETC
// (Financial Times, por símbolo de cotización en el campo "symbol", p. ej. "PPFB:GER:EUR") y el precio de Bitcoin (CoinGecko).
// Se ejecuta en GitHub Actions (.github/workflows/update-prices.yml). Node 20 o superior.
// ISIN nuevos: si existe FIREBASE_SERVICE_ACCOUNT, antes de actualizar se leen los activos de todos los usuarios en Firestore
// (users/{uid}.assets[].isin) y cada ISIN válido que aún no esté en prices.json se añade para cotizarlo desde esta misma
// pasada. Sin ese secreto (por ejemplo en local) se omite este paso y solo se actualizan los activos que ya están en el fichero.
// Reglas: si no se obtiene un precio fiable para un activo, se conserva el anterior y se anota el motivo en la salida.
// Cada activo guarda además "history" ({fecha: precio}) con los últimos HISTORY_DAYS días: la app lo usa para calcular las
// participaciones de una compra con el valor liquidativo de su fecha, no con el de cuando se abre la app.
import { readFile, writeFile } from "node:fs/promises";

const FILE = new URL("../prices.json", import.meta.url);
const UA = "Mozilla/5.0 (compatible; mis-finanzas-prices/1.0; +https://github.com/carloscr99/finanzas)";
const HISTORY_DAYS = 120;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

// "Oct 13 2026 19:36 BST" o "Oct 12 2026" -> "2026-10-13"
function parseFtDate(text) {
  const m = /([A-Za-z]{3}) (\d{1,2}) (\d{4})/.exec(text || "");
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Ficha de un fondo (por ISIN, clase en euros) o de un ETF/ETC (por símbolo "TICKER:MERCADO:MONEDA"); misma estructura de página.
async function fundPriceFromFT(isin) {
  return priceFromFT(`https://markets.ft.com/data/funds/tearsheet/summary?s=${encodeURIComponent(isin)}:EUR`);
}
async function etfPriceFromFT(symbol) {
  return priceFromFT(`https://markets.ft.com/data/etfs/tearsheet/summary?s=${encodeURIComponent(symbol)}`);
}
async function priceFromFT(url) {
  const html = await fetchText(url);
  const priceMatch = /mod-ui-data-list__value">([\d.,]+)</.exec(html);
  if (!priceMatch) throw new Error("no se encontró el precio en la página del FT");
  const price = Number(priceMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(price) || price <= 0) throw new Error(`precio no válido: ${priceMatch[1]}`);
  const dateMatch = /as of ([^<.]+)/.exec(html);
  const priceDate = parseFtDate(dateMatch && dateMatch[1]) || isoToday();
  // Nombre oficial del fondo según el título de la página ("Nombre del fondo, ISIN:EUR summary - FT.com").
  const titleMatch = /<title>([^<]+?),\s*[^,<]+summary - FT\.com<\/title>/i.exec(html);
  const ftName = titleMatch ? titleMatch[1].replace(/&amp;/g, "&").trim() : "";
  return { price, priceDate, source: "Financial Times (markets.ft.com)", ftName };
}

async function bitcoinPriceFromCoinGecko() {
  const json = JSON.parse(await fetchText("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur"));
  const price = Number(json?.bitcoin?.eur);
  if (!Number.isFinite(price) || price <= 0) throw new Error("respuesta de CoinGecko sin precio");
  return { price, priceDate: isoToday(), source: "CoinGecko" };
}

function addToHistory(asset) {
  const history = { ...(asset.history || {}) };
  if (asset.priceDate && asset.price > 0) history[asset.priceDate] = asset.price;
  const cutoff = new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString().slice(0, 10);
  asset.history = Object.fromEntries(Object.entries(history).filter(([d]) => d >= cutoff).sort(([a], [b]) => a.localeCompare(b)));
}

// Formato ISIN (2 letras de país + 9 alfanuméricos + dígito de control) y dígito de control (Luhn sobre letras convertidas a números).
export function isValidIsin(value) {
  const isin = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  const digits = isin.replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));
  let sum = 0;
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let n = Number(digits[i]);
    if (double) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

// Devuelve el conjunto de ISIN de los activos de todos los usuarios, o null si no hay credenciales.
// prices.json es público: de Firestore solo se toma el ISIN, nunca el nombre que el usuario puso al activo ni sus importes.
async function isinsFromFirestore() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  const serviceAccount = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  const { default: admin } = await import("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const snap = await admin.firestore().collection("users").get();
  const found = new Set();
  for (const userDoc of snap.docs) {
    const assets = userDoc.data()?.assets;
    for (const asset of Array.isArray(assets) ? assets : []) {
      const isin = String(asset?.isin || "").trim().toUpperCase();
      if (!isin) continue;
      if (!isValidIsin(isin)) { console.log(`ISIN no válido en un activo, se ignora: ${isin}`); continue; }
      found.add(isin);
    }
  }
  return found;
}

// Añade a prices.json los ISIN de Firestore que falten. Un fallo aquí no impide actualizar los precios ya conocidos.
async function addNewIsins(feed) {
  let found;
  try {
    found = await isinsFromFirestore();
  } catch (err) {
    console.log(`No se pudieron leer los activos de Firestore, se actualizan solo los de prices.json. Motivo: ${err.message}`);
    return;
  }
  if (!found) {
    console.log("Sin FIREBASE_SERVICE_ACCOUNT: no se buscan ISIN nuevos en Firestore.");
    return;
  }
  feed.assets = feed.assets || {};
  const added = [...found].filter(isin => !feed.assets[isin]);
  for (const isin of added) {
    // El nombre se rellena con el del FT en cuanto se obtiene el primer precio.
    feed.assets[isin] = { name: isin, price: null, priceDate: null, source: null, addedAt: isoToday(), history: {} };
    console.log(`ISIN nuevo añadido desde Firestore: ${isin}`);
  }
  console.log(`ISIN en Firestore: ${found.size} · nuevos en prices.json: ${added.length}`);
}

async function main() {
  const feed = JSON.parse(await readFile(FILE, "utf8"));
  await addNewIsins(feed);
  let updated = 0;
  for (const [key, asset] of Object.entries(feed.assets || {})) {
    try {
      const result = key === "BTC" ? await bitcoinPriceFromCoinGecko() : asset.symbol ? await etfPriceFromFT(asset.symbol) : await fundPriceFromFT(key);
      const { ftName, ...priceData } = result;
      const changed = priceData.price !== asset.price || priceData.priceDate !== asset.priceDate;
      Object.assign(asset, priceData);
      if (ftName && (!asset.name || asset.name === key)) asset.name = ftName;
      updated++;
      console.log(`${key} ${asset.name || ""}: ${result.price} EUR (${result.priceDate})${changed ? "" : " sin cambios"}`);
    } catch (err) {
      const kept = asset.price > 0 ? `se conserva el precio anterior (${asset.price} EUR, ${asset.priceDate})` : "sigue sin precio, se reintentará en la próxima pasada";
      console.log(`${key} ${asset.name || ""}: ${kept}. Motivo: ${err.message}`);
    }
    addToHistory(asset);
  }
  if (updated) feed.updatedAt = new Date().toISOString();
  await writeFile(FILE, JSON.stringify(feed, null, 2) + "\n", "utf8");
  console.log(`Activos actualizados: ${updated}/${Object.keys(feed.assets || {}).length}`);
}

// Solo se ejecuta al lanzarlo como script (así los tests pueden importar isValidIsin sin tocar prices.json).
if (process.argv[1]?.endsWith("update-prices.mjs")) main().catch((err) => {
  console.error("Error general, prices.json no se ha modificado:", err);
  process.exitCode = 1;
});
