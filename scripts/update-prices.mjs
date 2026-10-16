// Actualiza prices.json con el valor liquidativo de cada fondo (Financial Times, por ISIN), el precio de los ETF/ETC
// (Financial Times, por símbolo de cotización en el campo "symbol", p. ej. "PPFB:GER:EUR") y el precio de Bitcoin (CoinGecko).
// Se ejecuta en GitHub Actions (.github/workflows/update-prices.yml). Sin dependencias: Node 20 o superior.
// Reglas: si no se obtiene un precio fiable para un activo, se conserva el anterior y se anota el motivo en la salida.
import { readFile, writeFile } from "node:fs/promises";

const FILE = new URL("../prices.json", import.meta.url);
const UA = "Mozilla/5.0 (compatible; mis-finanzas-prices/1.0; +https://github.com/carloscr99/finanzas)";
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
  return { price, priceDate, source: "Financial Times (markets.ft.com)" };
}

async function bitcoinPriceFromCoinGecko() {
  const json = JSON.parse(await fetchText("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur"));
  const price = Number(json?.bitcoin?.eur);
  if (!Number.isFinite(price) || price <= 0) throw new Error("respuesta de CoinGecko sin precio");
  return { price, priceDate: isoToday(), source: "CoinGecko" };
}

async function main() {
  const feed = JSON.parse(await readFile(FILE, "utf8"));
  let updated = 0;
  for (const [key, asset] of Object.entries(feed.assets || {})) {
    try {
      const result = key === "BTC" ? await bitcoinPriceFromCoinGecko() : asset.symbol ? await etfPriceFromFT(asset.symbol) : await fundPriceFromFT(key);
      const changed = result.price !== asset.price || result.priceDate !== asset.priceDate;
      Object.assign(asset, result);
      updated++;
      console.log(`${key} ${asset.name || ""}: ${result.price} EUR (${result.priceDate})${changed ? "" : " sin cambios"}`);
    } catch (err) {
      console.log(`${key} ${asset.name || ""}: se conserva el precio anterior (${asset.price} EUR, ${asset.priceDate}). Motivo: ${err.message}`);
    }
  }
  if (updated) feed.updatedAt = new Date().toISOString();
  await writeFile(FILE, JSON.stringify(feed, null, 2) + "\n", "utf8");
  console.log(`Activos actualizados: ${updated}/${Object.keys(feed.assets || {}).length}`);
}

main().catch((err) => {
  console.error("Error general, prices.json no se ha modificado:", err);
  process.exitCode = 1;
});
